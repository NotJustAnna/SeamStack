import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { Options as SwcOptions } from '@swc/core'
import type { BuildTool, BuildToolContext, BuildToolOutput } from '@seamstack/core'

export interface SwcBuildOptions extends Partial<SwcOptions> {}

const SOURCE_EXT = /\.(mts|cts|tsx?|mjs|cjs|jsx?)$/

function defaultsFor(filename: string): SwcOptions {
  return {
    filename,
    sourceMaps: true,
    module: { type: 'es6' },
    jsc: {
      target: 'es2022',
      parser: {
        syntax: 'typescript',
        tsx: filename.endsWith('.tsx'),
      },
    },
  }
}

async function collectSourceFiles(rootDir: string): Promise<string[]> {
  const entries = await readdir(rootDir, { recursive: true, withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isFile() || !SOURCE_EXT.test(entry.name)) continue
    files.push(join(entry.parentPath ?? rootDir, entry.name))
  }
  return files
}

function outPathFor(file: string, rootDir: string, serverDir: string): string {
  const rel = relative(rootDir, file).replace(SOURCE_EXT, '.js')
  return join(serverDir, rel)
}

async function transformOne(
  swc: typeof import('@swc/core'),
  file: string,
  rootDir: string,
  serverDir: string,
  options: SwcBuildOptions | undefined,
): Promise<void> {
  const outPath = outPathFor(file, rootDir, serverDir)
  const result = await swc.transformFile(file, { ...defaultsFor(file), ...options })
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, result.code, 'utf8')
  if (result.map) await writeFile(outPath + '.map', result.map, 'utf8')
}

/**
 * `@swc/core` {@link BuildTool} — no bundling, same mirror-compile shape as
 * `@seamstack/tsc`: transpiles every source file under the entry's directory
 * into `serverDir`, preserving relative structure. Transpile-only (no type
 * checking) — swc doesn't type-check by design.
 *
 * `fastify({ buildTool: swc() })`
 */
export default function swcBuildTool(options?: SwcBuildOptions): BuildTool {
  return {
    name: 'swc',
    async build(ctx: BuildToolContext): Promise<BuildToolOutput> {
      const swc = await import('@swc/core')
      const rootDir = dirname(ctx.entryPath)
      const files = await collectSourceFiles(rootDir)
      await Promise.all(files.map((file) => transformOne(swc, file, rootDir, ctx.serverDir, options)))
      return { entryPath: outPathFor(ctx.entryPath, rootDir, ctx.serverDir) }
    },
    // No native watch API in @swc/core — createHostServeable falls back to
    // its naive debounced fs.watch()-and-rebuild loop for this tool.
  }
}
