import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'prod-manifest': 'src/prod-manifest.ts',
  },
  format: ['esm'],
  fixedExtension: false,
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  deps: {
    neverBundle: ['execa'],
  },
})
