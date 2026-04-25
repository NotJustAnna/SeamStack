import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    adapter: 'src/adapter.ts',
  },
  format: ['esm'],
  dts: true,
  clean: true,
  target: 'node20',
  sourcemap: true,
  splitting: false,
  external: [
    '@seamstack/core',
    '@nestjs/common',
    '@nestjs/core',
    '@nestjs/platform-express',
  ],
})
