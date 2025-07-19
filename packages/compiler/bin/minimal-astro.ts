#!/usr/bin/env node

import { parseArgs } from 'node:util';
import { build } from '../src/cli/build.js';

const VERSION = '0.0.1';

const HELP_TEXT = `
minimal-astro v${VERSION}

Usage: minimal-astro <command> [options]

Commands:
  build [dir]        Build your .astro files to static HTML
  --version, -v      Show version
  --help, -h         Show help

Examples:
  minimal-astro build
  minimal-astro build ./src
  minimal-astro build --output ./dist
`;

interface CliArgs {
  values: {
    help?: boolean;
    version?: boolean;
    output?: string;
  };
  positionals: string[];
}

function parseCliArgs(): CliArgs {
  try {
    const { values, positionals } = parseArgs({
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        output: { type: 'string', short: 'o' },
      },
      allowPositionals: true,
    });

    return { values, positionals };
  } catch (error) {
    console.error('Error parsing arguments:', error);
    process.exit(1);
  }
}

async function main() {
  const args = parseCliArgs();

  if (args.values.help) {
    console.log(HELP_TEXT);
    process.exit(0);
  }

  if (args.values.version) {
    console.log(`minimal-astro v${VERSION}`);
    process.exit(0);
  }

  const [command, ...commandArgs] = args.positionals;

  if (!command) {
    console.error('Error: No command provided\n');
    console.log(HELP_TEXT);
    process.exit(1);
  }

  try {
    switch (command) {
      case 'build': {
        const inputDir = commandArgs[0] ?? './src';
        const outputDir = args.values.output ?? './dist';

        await build({
          inputDir,
          outputDir,
        });
        break;
      }
      default:
        console.error(`Error: Unknown command "${command}"\n`);
        console.log(HELP_TEXT);
        process.exit(1);
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unexpected error:', error);
  process.exit(1);
});
