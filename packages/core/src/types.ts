/**
 * Whether SeamStack is running a dev server (`dev`) or a built application
 * (`prod` — `seam build` and `seam start`).
 */
export type SeamMode = 'dev' | 'prod'

/**
 * A user-supplied plugin in the fabric.
 *
 * Plugins extend a seam without being a "service" themselves — they don't
 * produce or host assets and don't bind a port. They can:
 *
 * - Declare additional `routes` the asset-host serves, so the dev frontend
 *   proxies them automatically.
 * - Hook into `dev` / `build` / `start` to spawn long-running processes
 *   (e.g. a codegen watcher) or one-shot tasks (e.g. running codegen as part
 *   of a build).
 *
 * All hooks are optional. A "pure proxy-paths plugin" sets `routes` only.
 */
export interface SeamPlugin {
  readonly kind: 'plugin'
  readonly name: string
  /**
   * Extra paths the asset-host serves (in addition to its `mountPath`). Each
   * entry must start with `/` and not equal `/`. The dev frontend proxies all
   * of these to the host.
   */
  readonly routes?: readonly string[]
  /** Spawn long-running dev-time work (e.g. `graphql-codegen --watch`). */
  dev?(ctx: PluginDevContext): Promise<PluginDevHandle> | PluginDevHandle
  /** One-shot build-time work (e.g. running codegen before the client build). */
  build?(ctx: PluginBuildContext): Promise<void> | void
  /** Long-running prod-time work (rare — usually plugins are dev/build only). */
  start?(ctx: PluginStartContext): Promise<PluginStartHandle> | PluginStartHandle
}

/** Returned from {@link SeamPlugin.dev}. The CLI calls `stop()` on shutdown. */
export interface PluginDevHandle {
  stop(): Promise<void> | void
}

/** Returned from {@link SeamPlugin.start}. The CLI calls `stop()` on shutdown. */
export interface PluginStartHandle {
  stop(): Promise<void> | void
}

/**
 * Context passed to {@link SeamPlugin.dev}.
 *
 * Like {@link DevContext} but without `assignedPort` — plugins don't bind
 * ports themselves. `peers` lists every resolved service in the fabric so
 * plugins can locate the host's address (e.g. for sidecar processes).
 */
export interface PluginDevContext extends BaseContext {
  readonly peers: readonly ResolvedService[]
  readonly outDir: string
}

/** Context passed to {@link SeamPlugin.build}. Mirrors {@link BuildContext}. */
export interface PluginBuildContext extends BaseContext {
  readonly outDir: string
  readonly peerOutputs: Readonly<Record<string, BuildOutput>>
}

/** Context passed to {@link SeamPlugin.start}. */
export interface PluginStartContext extends BaseContext {
  readonly peers: readonly ResolvedService[]
  readonly outDir: string
}

/**
 * Capabilities a {@link Serveable} declares about itself, used by the resolver
 * to decide which framework plays which role.
 *
 * - `producesAssets: true` — emits a frontend bundle (vite, astro, angular).
 * - `canHostAssets: true` — can serve a built SPA (hono, express, fastify, etc.).
 *
 * Exactly one asset-source and one asset-host are paired together; the
 * asset-host receives the asset-source's build output and serves it in prod.
 */
export interface ServeableTraits {
  readonly producesAssets: boolean
  readonly canHostAssets: boolean
  readonly defaultMountPath: string
}

/**
 * Fields available to every adapter lifecycle method (`dev`, `build`, `start`).
 *
 * - `publicHost` / `publicPort` / `publicUrl` describe the seam — the single
 *   address users hit. In dev these point at the asset-source's dev server
 *   (which proxies to the asset-host). In prod they point at the asset-host.
 */
export interface BaseContext {
  readonly mode: SeamMode
  readonly cwd: string
  readonly publicHost: string
  readonly publicPort: number
  readonly publicUrl: string
}

/** Returned from {@link Serveable.dev}. The CLI calls `stop()` on shutdown. */
export interface DevHandle {
  readonly url?: string
  stop(): Promise<void> | void
}

/** Returned from {@link Serveable.watch}. The CLI calls `stop()` on shutdown. */
export interface WatchHandle {
  stop(): Promise<void> | void
}

/**
 * Returned from {@link Serveable.build}.
 *
 * Asset-sources populate `assetsDir` and `indexHtml`; asset-hosts return `{}`
 * and pick up their peer's output via `BuildContext.peerOutputs`.
 */
export interface BuildOutput {
  readonly assetsDir?: string
  readonly indexHtml?: string
}

/** Returned from {@link Serveable.start}. The CLI calls `stop()` on shutdown. */
export interface StartHandle {
  readonly url?: string
  stop(): Promise<void> | void
}

/**
 * Context passed to {@link Serveable.dev}.
 *
 * `assignedPort` is the port this specific service should bind to (asset-source
 * gets the public port; asset-host gets a private internal port). `peers`
 * lists every other service in the fabric — adapters use this to set up
 * proxying from the asset-source to the asset-host.
 */
export interface DevContext extends BaseContext {
  readonly assignedPort: number
  readonly peers: readonly ResolvedService[]
  readonly outDir: string
}

/**
 * Context passed to {@link Serveable.build}.
 *
 * `peerOutputs` maps each peer's framework name to its {@link BuildOutput}.
 * An asset-host reads `peerOutputs[<frontend>]` to find the static assets it
 * should serve in prod.
 */
export interface BuildContext extends BaseContext {
  readonly outDir: string
  readonly peerOutputs: Readonly<Record<string, BuildOutput>>
}

/**
 * Context passed to {@link Serveable.start}.
 *
 * In `start`, the asset-host binds `publicHost:publicPort` directly — there
 * is no asset-source dev server in front of it.
 */
export interface StartContext extends BaseContext {
  readonly assignedPort: number
  readonly outDir: string
  readonly peers: readonly ResolvedService[]
}

/**
 * The contract every adapter implements.
 *
 * Adapter packages export factory functions (e.g. `vite()`, `hono()`) that
 * return a `Serveable`. End-users don't usually construct these directly;
 * they list the factories' return values in `defineWeave({ fabric: [...] })`.
 */
export interface Serveable {
  readonly kind: 'serveable'
  readonly framework: string
  readonly traits: ServeableTraits
  /**
   * User-supplied list of paths this service serves, overriding
   * `traits.defaultMountPath`. When set, the resolver uses these verbatim
   * (you must include `/api` yourself if you want it). When unset, the
   * resolver falls back to `[traits.defaultMountPath]`.
   *
   * Set by asset-host adapters from their `routes` option. The dev frontend
   * proxies each entry to this service.
   */
  readonly routes?: readonly string[]
  dev(ctx: DevContext): Promise<DevHandle>
  build(ctx: BuildContext): Promise<BuildOutput>
  watch?(ctx: BuildContext): Promise<WatchHandle>
  start(ctx: StartContext): Promise<StartHandle>
}

/** A single entry in the fabric — either an adapter or a (future) plugin. */
export type FabricItem = Serveable | SeamPlugin

/**
 * The shape passed to {@link defineWeave}.
 *
 * @property fabric  - Adapters (and future plugins) that compose the seam. Today this is
 *   exactly one asset-source (vite/astro/angular) and one asset-host
 *   (hono/express/fastify/elysia/nestjs).
 * @property port    - Port the seam binds in dev/start. Defaults to 4567 if unset.
 * @property host    - Host the seam binds. Defaults to `localhost`. Use `0.0.0.0` to
 *   expose on the LAN. Overridable from the CLI via `seam dev --host`.
 */
export interface WeaveInput {
  readonly fabric: readonly FabricItem[]
  readonly port?: number
  readonly host?: string
}

/**
 * Whether a service produces assets (frontend) or hosts them (backend).
 *
 * Computed by the resolver from each adapter's {@link ServeableTraits}.
 */
export type ServiceRole = 'asset-source' | 'asset-host'

/** A {@link Serveable} after the resolver has assigned it a role, port, and mount. */
export interface ResolvedService {
  readonly instance: Serveable
  readonly framework: string
  readonly role: ServiceRole
  readonly mountPath: string
  /**
   * Full list of paths this service handles. For asset-hosts, this is the
   * adapter's `routes` (or `[defaultMountPath]` if unset) plus any
   * plugin-contributed routes, deduped in declaration order. For
   * asset-sources, just `[mountPath]`. `mountPath` is `routes[0]`.
   */
  readonly routes: readonly string[]
  readonly devPort: number
  readonly prodPort: number
}

/** A {@link SeamPlugin} after the resolver has accepted it into the topology. */
export interface ResolvedPlugin {
  readonly instance: SeamPlugin
  readonly name: string
  readonly routes: readonly string[]
}

/** The full shape returned by the resolver. Exposed via `seam plan`. */
export interface ResolvedTopology {
  readonly publicHost: string
  readonly publicPort: number
  readonly publicUrl: string
  readonly services: readonly ResolvedService[]
  readonly plugins: readonly ResolvedPlugin[]
  readonly routing: Readonly<Record<string, string>>
  readonly mode: SeamMode
}
