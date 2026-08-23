import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  external: ["rollup", "@rollup/plugin-typescript", "@rollup/plugin-node-resolve", "@seamstack/core"],
})
