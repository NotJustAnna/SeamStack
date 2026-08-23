import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    adapter: 'src/adapter.ts',
    'angular-worker': 'src/angular-worker.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  splitting: false,
  deps: {
    neverBundle: [
      '@seamstack/core',
      '@angular-devkit/architect',
      '@angular-devkit/architect/node',
      '@angular-devkit/core',
    ],
  },
})
