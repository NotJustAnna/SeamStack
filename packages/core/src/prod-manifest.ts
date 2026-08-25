import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Filename `seam build` writes the prod manifest to, in `dist/server`. */
export const PROD_MANIFEST_FILENAME = '_seam_prod.js'

function findUpManifestDir(startDir: string): string | undefined {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, PROD_MANIFEST_FILENAME))) return dir
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

/**
 * Resolves the directory to load `_seam_prod.js` from.
 *
 * Prefers `wireDistDir` (set by `seam start`). Otherwise walks up from the
 * running entry script's directory (`process.argv[1]`) looking for the
 * manifest — this is what makes a compiled server first-class to run with a
 * plain `node dist/server/index.js`, not just something `seam start` can
 * launch. Falls back to `process.cwd()` only if neither locates it.
 */
export function resolveManifestDir(wireDistDir: string | undefined): string {
  if (wireDistDir) return wireDistDir
  const entry = process.argv[1]
  const found = entry ? findUpManifestDir(dirname(entry)) : undefined
  return found ?? process.cwd()
}
