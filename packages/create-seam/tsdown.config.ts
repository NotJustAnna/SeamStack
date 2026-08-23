import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  splitting: false,
  deps: {
    neverBundle: ['@clack/prompts', 'cac', 'picocolors'],
  },
})
