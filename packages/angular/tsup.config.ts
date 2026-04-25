import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    adapter: 'src/adapter.ts',
    'angular-worker': 'src/angular-worker.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  splitting: false,
  external: [
    '@seamstack/core',
    '@angular-devkit/architect',
    '@angular-devkit/architect/node',
    '@angular-devkit/core',
  ],
})
