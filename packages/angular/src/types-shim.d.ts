// `@angular-devkit/architect` ships a `/node` subpath but its package.json has
// no `exports` field, so TypeScript under `moduleResolution: NodeNext` won't
// resolve the implicit subpath. Declare the surface we use; runtime resolution
// works fine via Node's classic CJS lookup.
declare module '@angular-devkit/architect/node' {
  import type { json, workspaces } from '@angular-devkit/core'
  import type { BuilderInfo, Target } from '@angular-devkit/architect'

  // Mirrors the real ArchitectHost<NodeModulesBuilderInfo> shape from
  // @angular-devkit/architect/src/internal.d.ts so that instances satisfy the
  // `new Architect(host, registry)` constructor signature.
  type NodeModulesBuilderInfo = BuilderInfo & { import: string }

  export class WorkspaceNodeModulesArchitectHost {
    constructor(
      workspace: workspaces.WorkspaceDefinition,
      root: string,
    )
    getBuilderNameForTarget(target: Target): Promise<string>
    resolveBuilder(
      builderStr: string,
      basePath?: string,
      seenBuilders?: Set<string>,
    ): Promise<NodeModulesBuilderInfo>
    loadBuilder(info: NodeModulesBuilderInfo): Promise<any>
    getCurrentDirectory(): Promise<string>
    getWorkspaceRoot(): Promise<string>
    getOptionsForTarget(target: Target): Promise<json.JsonObject | null>
    getProjectMetadata(target: Target | string): Promise<json.JsonObject | null>
  }
}
