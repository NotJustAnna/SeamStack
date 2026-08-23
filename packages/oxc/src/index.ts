import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'
import type { TransformOptions } from 'oxc-transform'
import type { BuildTool, BuildToolContext, BuildToolOutput } from '@seamstack/core'

export interface OxcBuildOptions extends Partial<TransformOptions> {}

const SOURCE_EXT = /\.(mts|cts|tsx?|mjs|cjs|jsx?)$/

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
  transform: typeof import('oxc-transform').transform,
  file: string,
  rootDir: string,
  serverDir: string,
  options: OxcBuildOptions | undefined,
): Promise<void> {
  const outPath = outPathFor(file, rootDir, serverDir)
  const source = await readFile(file, 'utf8')
  const result = await transform(file, source, { sourcemap: true, ...options })
  if (result.errors.length > 0) {
    const message = result.errors.map((e) => e.message).join('\n')
    throw new Error(`[@seamstack/oxc] compile failed for ${file}:\n${message}`)
  }
  await mkdir(dirname(outPath), { recursive: true })
  await writeFile(outPath, result.code, 'utf8')
  if (result.map) await writeFile(outPath + '.map', JSON.stringify(result.map), 'utf8')
}

/**
 * `oxc-transform` {@link BuildTool} — no bundling, same mirror-compile shape
 * as `@seamstack/tsc`/`@seamstack/swc`: transpiles every source file under
 * the entry's directory into `serverDir`, preserving relative structure.
 * Transpile-only (no type checking), like swc — oxc's transformer doesn't
 * type-check by design.
 *
 * `fastify({ buildTool: oxc() })`
 */
export default function oxc(options?: OxcBuildOptions): BuildTool {
  return {
    name: 'oxc',
    async build(ctx: BuildToolContext): Promise<BuildToolOutput> {
      const { transform } = await import('oxc-transform')
      const rootDir = dirname(ctx.entryPath)
      const files = await collectSourceFiles(rootDir)
      await Promise.all(files.map((file) => transformOne(transform, file, rootDir, ctx.serverDir, options)))
      return { entryPath: outPathFor(ctx.entryPath, rootDir, ctx.serverDir) }
    },
    // No native watch API in oxc-transform — createHostServeable falls back
    // to its naive debounced fs.watch()-and-rebuild loop for this tool.
  }
}
