import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    adapter: 'src/adapter.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  deps: {
    neverBundle: ['elysia', '@elysiajs/static', '@seamstack/core'],
  },
})
