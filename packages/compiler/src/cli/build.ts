import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, dirname, relative, extname } from 'node:path';
import { existsSync } from 'node:fs';
import { parseAstro } from '../parse.js';
import { buildHtml } from '../html-builder.js';
import type { Diagnostic } from '../../types/ast.js';

export interface BuildOptions {
  inputDir: string;
  outputDir: string;
}

interface BuildResult {
  success: boolean;
  processedFiles: number;
  errors: number;
  warnings: number;
  diagnostics: Diagnostic[];
}

/**
 * Recursively finds all .astro files in a directory
 */
async function findAstroFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const subFiles = await findAstroFiles(fullPath);
        files.push(...subFiles);
      } else if (entry.isFile() && extname(entry.name) === '.astro') {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    throw new Error(`Failed to read directory: ${dir}`);
  }
  
  return files;
}

/**
 * Converts .astro file path to .html output path
 */
function getOutputPath(inputPath: string, inputDir: string, outputDir: string): string {
  const relativePath = relative(inputDir, inputPath);
  const outputPath = join(outputDir, relativePath);
  
  // Change .astro extension to .html
  return outputPath.replace(/\.astro$/, '.html');
}

/**
 * Ensures a directory exists, creating it if necessary
 */
async function ensureDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { recursive: true });
  } catch (error) {
    throw new Error(`Failed to create directory: ${dir}`);
  }
}

/**
 * Processes a single .astro file and writes the HTML output
 */
async function processFile(
  inputPath: string,
  inputDir: string,
  outputDir: string
): Promise<{
  success: boolean;
  diagnostics: Diagnostic[];
}> {
  try {
    // Read the .astro file
    const source = await readFile(inputPath, 'utf-8');
    
    // Parse the file
    const parseResult = parseAstro(source, {
      filename: inputPath,
    });
    
    // Build HTML from AST
    const html = buildHtml(parseResult.ast, {
      prettyPrint: true,
    });
    
    // Determine output path
    const outputPath = getOutputPath(inputPath, inputDir, outputDir);
    const outputDirPath = dirname(outputPath);
    
    // Ensure output directory exists
    await ensureDir(outputDirPath);
    
    // Write the HTML file
    await writeFile(outputPath, html, 'utf-8');
    
    return {
      success: true,
      diagnostics: parseResult.diagnostics,
    };
  } catch (error) {
    const diagnostic: Diagnostic = {
      code: 'build-error',
      message: `Build error: ${error instanceof Error ? error.message : String(error)}`,
      loc: {
        start: { line: 1, column: 1, offset: 0 },
        end: { line: 1, column: 1, offset: 0 },
      },
      severity: 'error',
    };
    
    return {
      success: false,
      diagnostics: [diagnostic],
    };
  }
}

/**
 * Formats diagnostic messages for console output
 */
function formatDiagnostic(diagnostic: Diagnostic, filename: string): string {
  const { severity, code, message, loc } = diagnostic;
  const location = `${filename}:${loc.start.line}:${loc.start.column}`;
  const prefix = severity === 'error' ? '✗' : '⚠';
  
  return `${prefix} ${location} ${code}: ${message}`;
}

/**
 * Main build function
 */
export async function build(options: BuildOptions): Promise<BuildResult> {
  const { inputDir, outputDir } = options;
  
  console.log(`🚀 Building .astro files from "${inputDir}" to "${outputDir}"`);
  
  // Check if input directory exists
  if (!existsSync(inputDir)) {
    throw new Error(`Input directory does not exist: ${inputDir}`);
  }
  
  // Find all .astro files
  const astroFiles = await findAstroFiles(inputDir);
  
  if (astroFiles.length === 0) {
    console.log('📁 No .astro files found');
    return {
      success: true,
      processedFiles: 0,
      errors: 0,
      warnings: 0,
      diagnostics: [],
    };
  }
  
  console.log(`📄 Found ${astroFiles.length} .astro file${astroFiles.length === 1 ? '' : 's'}`);
  
  // Process all files
  const results: BuildResult = {
    success: true,
    processedFiles: 0,
    errors: 0,
    warnings: 0,
    diagnostics: [],
  };
  
  for (const astroFile of astroFiles) {
    const relativePath = relative(inputDir, astroFile);
    console.log(`🔨 Processing ${relativePath}...`);
    
    const result = await processFile(astroFile, inputDir, outputDir);
    
    if (result.success) {
      results.processedFiles++;
    } else {
      results.success = false;
    }
    
    // Collect diagnostics
    results.diagnostics.push(...result.diagnostics);
    
    // Count errors and warnings
    for (const diagnostic of result.diagnostics) {
      if (diagnostic.severity === 'error') {
        results.errors++;
      } else if (diagnostic.severity === 'warning') {
        results.warnings++;
      }
    }
    
    // Report diagnostics for this file
    for (const diagnostic of result.diagnostics) {
      console.log(formatDiagnostic(diagnostic, relativePath));
    }
  }
  
  // Final summary
  console.log('\\n📊 Build Summary:');
  console.log(`   Files processed: ${results.processedFiles}`);
  console.log(`   Errors: ${results.errors}`);
  console.log(`   Warnings: ${results.warnings}`);
  
  if (results.success) {
    console.log('✅ Build completed successfully!');
  } else {
    console.log('❌ Build completed with errors');
  }
  
  return results;
}