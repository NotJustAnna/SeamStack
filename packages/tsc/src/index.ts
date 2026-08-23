import { dirname, join } from 'node:path'
import ts from 'typescript'
import type { BuildTool, BuildToolContext, BuildToolOutput, BuildToolWatchHandle } from '@seamstack/core'

export interface TscOptions {
  /** Path to a tsconfig.json to base compiler options on (defaults auto-discovered near the entry). */
  readonly tsconfig?: string
}

function compilerOptionsFor(ctx: BuildToolContext, options: TscOptions | undefined): ts.CompilerOptions {
  const rootDir = dirname(ctx.entryPath)
  const configPath =
    options?.tsconfig ?? ts.findConfigFile(rootDir, ts.sys.fileExists.bind(ts.sys), 'tsconfig.json')

  let base: ts.CompilerOptions = {}
  if (configPath) {
    const read = ts.readConfigFile(configPath, ts.sys.readFile.bind(ts.sys))
    if (!read.error) {
      const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, dirname(configPath))
      base = parsed.options
    }
  }

  return {
    ...base,
    rootDir,
    outDir: ctx.serverDir,
    noEmit: false,
    declaration: false,
    sourceMap: true,
    allowJs: true,
    module: ts.ModuleKind.ESNext,
    target: base.target ?? ts.ScriptTarget.ES2022,
    moduleResolution: base.moduleResolution ?? ts.ModuleResolutionKind.Bundler,
  }
}

const SOURCE_EXT = /\.(tsx|ts|mts|cts|jsx|js|mjs|cjs)$/

function outputEntryFor(ctx: BuildToolContext, compilerOptions: ts.CompilerOptions): string {
  const rootDir = compilerOptions.rootDir ?? dirname(ctx.entryPath)
  const relToRoot = ctx.entryPath.slice(rootDir.length).replace(SOURCE_EXT, '.js')
  return join(ctx.serverDir, relToRoot)
}

function collectSourceFiles(rootDir: string): string[] {
  const files: string[] = []
  for (const name of ts.sys.readDirectory(rootDir, [
    '.ts',
    '.tsx',
    '.mts',
    '.cts',
    '.js',
    '.jsx',
    '.mjs',
    '.cjs',
  ])) {
    files.push(name)
  }
  return files
}

const FORMAT_HOST: ts.FormatDiagnosticsHost = {
  getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
  getNewLine: () => ts.sys.newLine,
  getCanonicalFileName: (f) => f,
}

/**
 * Transpile-only semantics, like `tsx`/`ts-node --transpileOnly`: type errors
 * are surfaced (`seam typecheck` / your editor already cover type safety) but
 * don't block a production build. Only a real failure to emit — a syntax
 * error, not a type error — throws.
 */
function reportIfEmitFailed(program: ts.Program, emitResult: ts.EmitResult): void {
  if (!emitResult.emitSkipped) return
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics)
  const message = ts.formatDiagnosticsWithColorAndContext(diagnostics, FORMAT_HOST)
  throw new Error(`[@seamstack/tsc] compile failed:\n${message}`)
}

const TS_ENTRY = /\.(tsx|ts|mts|cts)$/

function assertTsEntry(entryPath: string): void {
  if (!TS_ENTRY.test(entryPath)) {
    throw new Error(
      `[@seamstack/tsc] entry '${entryPath}' is not a TypeScript file — tsc compiles TS to JS, ` +
        `it doesn't bundle. Use a bundler build tool (esbuild/rollup/rolldown/webpack) for a JS entry.`,
    )
  }
}

/**
 * `tsc` {@link BuildTool} — no bundling. Mirror-compiles every source file
 * under the entry's directory into `serverDir`, preserving relative
 * structure, and reuses the project's own tsconfig where one is found.
 * Rejects a non-TS entry (see {@link assertTsEntry}) — allowJs only covers
 * auxiliary files imported *from* the TS entry, not the entry itself.
 *
 * `fastify({ buildTool: tsc() })`
 */
export default function tsc(options?: TscOptions): BuildTool {
  return {
    name: 'tsc',
    async build(ctx: BuildToolContext): Promise<BuildToolOutput> {
      assertTsEntry(ctx.entryPath)
      const compilerOptions = compilerOptionsFor(ctx, options)
      const rootDir = compilerOptions.rootDir ?? dirname(ctx.entryPath)
      const program = ts.createProgram(collectSourceFiles(rootDir), compilerOptions)
      const emitResult = program.emit()
      reportIfEmitFailed(program, emitResult)
      return { entryPath: outputEntryFor(ctx, compilerOptions) }
    },
    async watch(
      ctx: BuildToolContext,
      onRebuild: (out: BuildToolOutput) => void,
    ): Promise<BuildToolWatchHandle> {
      assertTsEntry(ctx.entryPath)
      const compilerOptions = compilerOptionsFor(ctx, options)
      const rootDir = compilerOptions.rootDir ?? dirname(ctx.entryPath)
      const entryPath = outputEntryFor(ctx, compilerOptions)

      const host = ts.createWatchCompilerHost(
        collectSourceFiles(rootDir),
        compilerOptions,
        ts.sys,
        ts.createEmitAndSemanticDiagnosticsBuilderProgram,
        (diagnostic) => {
          if (diagnostic.category === ts.DiagnosticCategory.Error) {
            process.stderr.write(ts.formatDiagnostic(diagnostic, FORMAT_HOST) + '\n')
          }
        },
        (diagnostic) => {
          // TS6194: "Found N errors. Watching for file changes." — end of a compile cycle.
          if (diagnostic.code === 6194 || diagnostic.code === 6193) {
            onRebuild({ entryPath })
          }
        },
      )
      const watchProgram = ts.createWatchProgram(host)
      return {
        stop() {
          watchProgram.close()
        },
      }
    },
  }
}
