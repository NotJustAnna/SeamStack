export interface BuildToolContext {
  /** Absolute path to the TS/JS source entry. */
  readonly entryPath: string
  /** Absolute dir compiled output should land in (`dist/server`). */
  readonly serverDir: string
  /** Project root, for resolving the project's own tsconfig etc. */
  readonly cwd: string
}

export interface BuildToolOutput {
  /** Absolute path to the runnable compiled JS entry. */
  readonly entryPath: string
}

export interface BuildToolWatchHandle {
  stop(): Promise<void> | void
}

/**
 * A pluggable build tool a backend adapter can be told to compile its server
 * entry with (`fastify({ buildTool: tsc() })`). Compiling is opt-in — when no
 * `buildTool` is given, the entry runs directly (see {@link Runner}); this
 * interface only exists for the explicit "yes, produce a JS build" path.
 */
export interface BuildTool {
  readonly name: string
  build(ctx: BuildToolContext): Promise<BuildToolOutput>
  /**
   * Optional: continuous rebuild for `seam build --watch`. Tools without a
   * native watch API may omit this — `createHostServeable` falls back to a
   * naive debounced `fs.watch(cwd, {recursive:true})` → rebuild loop.
   */
  watch?(
    ctx: BuildToolContext,
    onRebuild: (out: BuildToolOutput) => void,
  ): Promise<BuildToolWatchHandle>
}

/**
 * How to execute an entry point directly (no build step), or a compiled
 * build's output. Orthogonal to {@link BuildTool}: `runner` picks the binary,
 * `buildTool` (if any) picks what gets produced for it to run.
 *
 * `tsx` is only today's default — not a permanent one.
 */
export type Runner = 'tsx' | 'node' | 'bun' | 'nub' | 'deno'
