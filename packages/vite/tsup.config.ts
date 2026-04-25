import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/plugin.ts', 'src/adapter.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  external: ['vite', '@seamstack/core'],
})
