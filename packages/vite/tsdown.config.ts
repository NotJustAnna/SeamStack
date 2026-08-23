import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/plugin.ts', 'src/adapter.ts'],
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  deps: {
    neverBundle: ['vite', '@seamstack/core'],
  },
})
