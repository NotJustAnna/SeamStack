import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  deps: {
    neverBundle: ["rollup", "@rollup/plugin-typescript", "@rollup/plugin-node-resolve", "@seamstack/core"],
  },
})
