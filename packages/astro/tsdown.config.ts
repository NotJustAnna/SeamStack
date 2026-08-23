import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    adapter: 'src/adapter.ts',
    'astro-worker': 'src/astro-worker.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  splitting: false,
  deps: {
    neverBundle: ['astro', '@seamstack/core'],
  },
})
