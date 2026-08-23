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
    neverBundle: ["webpack", "ts-loader", "typescript", "@seamstack/core"],
  },
})
