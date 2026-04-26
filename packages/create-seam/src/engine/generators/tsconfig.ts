import type { Host } from '../spec.js'
import type { RenderedConfig } from './vite-config.js'

export function renderTsconfig(host: Host): RenderedConfig | null {
  if (host === 'angular') return null

  const base = {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      strict: true,
      noUncheckedIndexedAccess: true,
      noImplicitOverride: true,
      jsx: 'react-jsx',
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
    include:
      host === 'astro'
        ? ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.astro', 'server/**/*.ts', 'seam.config.ts']
        : [
            'client/**/*.ts',
            'client/**/*.tsx',
            'server/**/*.ts',
            'seam.config.ts',
            'vite.config.ts',
          ],
  }

  return {
    filename: 'tsconfig.json',
    source: JSON.stringify(base, null, 2) + '\n',
  }
}
