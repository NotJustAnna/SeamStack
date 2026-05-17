import type { Addon, Host } from '../spec.js'
import type { RenderedConfig } from './vite-config.js'

export function renderTsconfig(host: Host, addons: readonly Addon[]): RenderedConfig[] {
  if (host === 'angular') return []

  const hasShared = addons.includes('shared')
  const isAstro = host === 'astro'
  const clientDir = isAstro ? 'src' : 'client'

  const baseConfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      noEmit: true,
      isolatedModules: true,
      allowImportingTsExtensions: true,
      esModuleInterop: true,
      skipLibCheck: true,
      verbatimModuleSyntax: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      useDefineForClassFields: false,
    },
  }

  const rootInclude = isAstro ? ['seam.config.ts'] : ['seam.config.ts', 'vite.config.ts']
  if (hasShared) rootInclude.push('shared/**/*.ts')

  const clientInclude = ['**/*.ts', '**/*.tsx']
  if (isAstro) clientInclude.push('**/*.astro')
  if (hasShared) clientInclude.push('../shared/**/*.ts')

  const serverInclude: string[] = ['**/*.ts']
  if (hasShared) serverInclude.push('../shared/**/*.ts')

  return [
    {
      filename: 'tsconfig.base.json',
      source: JSON.stringify(baseConfig, null, 2) + '\n',
    },
    {
      filename: 'tsconfig.json',
      source:
        JSON.stringify(
          {
            extends: './tsconfig.base.json',
            compilerOptions: { lib: ['ES2022'], types: ['node'] },
            include: rootInclude,
          },
          null,
          2,
        ) + '\n',
    },
    {
      filename: `${clientDir}/tsconfig.json`,
      source:
        JSON.stringify(
          {
            extends: '../tsconfig.base.json',
            compilerOptions: { lib: ['ES2022', 'DOM', 'DOM.Iterable'], jsx: 'react-jsx' },
            include: clientInclude,
          },
          null,
          2,
        ) + '\n',
    },
    {
      filename: 'server/tsconfig.json',
      source:
        JSON.stringify(
          {
            extends: '../tsconfig.base.json',
            compilerOptions: { lib: ['ES2022'], types: ['node'] },
            include: serverInclude,
          },
          null,
          2,
        ) + '\n',
    },
  ]
}
