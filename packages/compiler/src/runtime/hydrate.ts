/**
 * Hydration runtime for Astro components
 * Handles client-side hydration based on directives
 */

export interface HydrationOptions {
  /**
   * Root element selector or element
   */
  root?: string | HTMLElement;

  /**
   * Component registry
   */
  components: Map<string, any>;

  /**
   * React or Preact
   */
  runtime: 'react' | 'preact';

  /**
   * Custom render function
   */
  render?: (component: any, container: HTMLElement) => void;
}

export interface HydrationContext {
  /**
   * Hydrated components
   */
  hydrated: Set<string>;

  /**
   * Pending hydrations
   */
  pending: Map<string, PendingHydration>;

  /**
   * Observer instances
   */
  observers: {
    intersection?: IntersectionObserver;
    mutation?: MutationObserver;
  };
}

export interface PendingHydration {
  element: HTMLElement;
  component: any;
  props: Record<string, any>;
  directive: string;
  value?: string;
}

/**
 * Create hydration runtime
 */
export function createHydrationRuntime(options: HydrationOptions) {
  const { components, runtime, render } = options;

  // Hydration context
  const context: HydrationContext = {
    hydrated: new Set(),
    pending: new Map(),
    observers: {},
  };

  /**
   * Default render function
   */
  const defaultRender = (component: any, container: HTMLElement) => {
    if (runtime === 'react') {
      // Assume React is available globally
      const React = (window as any).React;
      const ReactDOM = (window as any).ReactDOM;

      if (React && ReactDOM) {
        ReactDOM.hydrate(React.createElement(component), container);
      }
    } else if (runtime === 'preact') {
      // Assume Preact is available globally
      const { h, hydrate } = (window as any).preact;

      if (h && hydrate) {
        hydrate(h(component), container);
      }
    }
  };

  const renderFn = render || defaultRender;

  /**
   * Hydrate a component
   */
  function hydrateComponent(element: HTMLElement, immediate = false): void {
    const componentId = element.id;
    if (!componentId || context.hydrated.has(componentId)) {
      return;
    }

    // Get hydration data
    const hydrationData = (window as any).__ASTRO_HYDRATION_DATA__;
    if (!hydrationData) {
      console.error('No hydration data found');
      return;
    }

    // Find directive for this component
    const directive = hydrationData.directives.find((d: any) => d.componentId === componentId);

    if (!directive) {
      console.error(`No directive found for component ${componentId}`);
      return;
    }

    // Get component
    const componentName = element.getAttribute('data-astro-component');
    const Component = components.get(componentName || '');

    if (!Component) {
      console.error(`Component ${componentName} not found in registry`);
      return;
    }

    // Create pending hydration
    const pending: PendingHydration = {
      element,
      component: Component,
      props: directive.props,
      directive: directive.type,
      value: directive.value,
    };

    if (immediate) {
      performHydration(pending);
    } else {
      context.pending.set(componentId, pending);
      scheduleHydration(pending);
    }
  }

  /**
   * Perform the actual hydration
   */
  function performHydration(pending: PendingHydration): void {
    const { element, component, props } = pending;
    const componentId = element.id;

    try {
      // Mark as hydrated first to prevent double hydration
      context.hydrated.add(componentId);
      context.pending.delete(componentId);

      // Hydrate the component
      renderFn(component, element);

      // Dispatch hydration event
      element.dispatchEvent(
        new CustomEvent('astro:hydrate', {
          detail: { component, props },
        })
      );
    } catch (error) {
      console.error(`Failed to hydrate component ${componentId}:`, error);
      context.hydrated.delete(componentId); // Allow retry
    }
  }

  /**
   * Schedule hydration based on directive
   */
  function scheduleHydration(pending: PendingHydration): void {
    const { directive, value } = pending;

    switch (directive) {
      case 'load':
        // Hydrate immediately
        requestIdleCallback(() => performHydration(pending));
        break;

      case 'idle':
        // Hydrate when browser is idle
        requestIdleCallback(() => performHydration(pending), {
          timeout: 2000,
        });
        break;

      case 'visible':
        // Hydrate when visible
        observeVisibility(pending);
        break;

      case 'media':
        // Hydrate when media query matches
        if (value) {
          observeMediaQuery(pending, value);
        }
        break;

      case 'only':
        // Client-only, hydrate immediately
        performHydration(pending);
        break;

      default:
        console.warn(`Unknown hydration directive: ${directive}`);
        performHydration(pending);
    }
  }

  /**
   * Observe element visibility
   */
  function observeVisibility(pending: PendingHydration): void {
    if (!context.observers.intersection) {
      context.observers.intersection = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const componentId = entry.target.id;
              const pendingHydration = context.pending.get(componentId);

              if (pendingHydration) {
                performHydration(pendingHydration);
                context.observers.intersection?.unobserve(entry.target);
              }
            }
          });
        },
        {
          rootMargin: '50px',
        }
      );
    }

    context.observers.intersection.observe(pending.element);
  }

  /**
   * Observe media query
   */
  function observeMediaQuery(pending: PendingHydration, query: string): void {
    const mediaQuery = window.matchMedia(query);

    const checkAndHydrate = () => {
      if (mediaQuery.matches) {
        performHydration(pending);
      }
    };

    // Check immediately
    checkAndHydrate();

    // Listen for changes
    mediaQuery.addEventListener('change', checkAndHydrate);
  }

  /**
   * Find and hydrate all components
   */
  function hydrateAll(): void {
    const root = options.root || document.body;
    const rootElement = typeof root === 'string' ? document.querySelector(root) : root;

    if (!rootElement) {
      console.error('Root element not found');
      return;
    }

    // Find all hydration roots
    const hydrationRoots = rootElement.querySelectorAll('[data-astro-root]');

    hydrationRoots.forEach((element) => {
      if (element instanceof HTMLElement) {
        hydrateComponent(element);
      }
    });
  }

  /**
   * Cleanup function
   */
  function cleanup(): void {
    // Clear pending hydrations
    context.pending.clear();

    // Disconnect observers
    if (context.observers.intersection) {
      context.observers.intersection.disconnect();
    }

    if (context.observers.mutation) {
      context.observers.mutation.disconnect();
    }
  }

  return {
    hydrateAll,
    hydrateComponent,
    cleanup,
    context,
  };
}

/**
 * RequestIdleCallback polyfill
 */
const requestIdleCallback =
  (typeof window !== 'undefined' ? (window as any).requestIdleCallback : null) ||
  ((callback: (deadline: any) => void, options?: { timeout?: number }) => {
    const start = Date.now();
    return setTimeout(() => {
      callback({
        didTimeout: false,
        timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
      });
    }, options?.timeout || 1);
  });

/**
 * Auto-hydration script
 */
export function autoHydrate(options: HydrationOptions): void {
  // Wait for DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      const runtime = createHydrationRuntime(options);
      runtime.hydrateAll();

      // Store runtime for debugging
      (window as any).__ASTRO_RUNTIME__ = runtime;
    });
  } else {
    const runtime = createHydrationRuntime(options);
    runtime.hydrateAll();

    // Store runtime for debugging
    (window as any).__ASTRO_RUNTIME__ = runtime;
  }
}

/**
 * Manual hydration function
 */
export function hydrate(
  componentId: string,
  component: any,
  props: Record<string, any>,
  options: Partial<HydrationOptions> = {}
): void {
  const element = document.getElementById(componentId);
  if (!element) {
    console.error(`Element with id ${componentId} not found`);
    return;
  }

  const runtime =
    (window as any).__ASTRO_RUNTIME__ ||
    createHydrationRuntime({
      components: new Map([[component.name, component]]),
      runtime: options.runtime || 'react',
      ...options,
    });

  runtime.hydrateComponent(element, true);
}
