import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    bin: 'src/bin.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  splitting: false,
  external: [
    '@seamstack/core',
    'bundle-require',
    'cac',
    'esbuild',
    'ink',
    'react',
    'react/jsx-runtime',
    'picocolors',
  ],
})
