import { astroVitePlugin } from '@minimal-astro/compiler';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    astroVitePlugin({
      dev: true,
      prettyPrint: true,
    }),
  ],
  server: {
    port: 3000,
  },
});
