import { existsSync, statSync } from 'node:fs'
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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * Resolves the directory to load `_seam_prod.js` from.
 *
 * Prefers `wireDistDir` (set by `seam start`). Otherwise walks up from the
 * running entry's own directory (`process.argv[1]`) looking for the
 * manifest — this is what makes a compiled server first-class to run with a
 * plain `node dist/server`, not just something `seam start` can launch.
 * `process.argv[1]` can itself be a directory (e.g. `node dist/server`,
 * where Node resolves the `index.js` inside but leaves argv[1] as the
 * directory it was given) — start the walk from that directory directly
 * rather than its parent. Falls back to `process.cwd()` if nothing is found.
 */
export function resolveManifestDir(wireDistDir: string | undefined): string {
  if (wireDistDir) return wireDistDir
  const entry = process.argv[1]
  if (!entry) return process.cwd()
  const startDir = isDirectory(entry) ? entry : dirname(entry)
  return findUpManifestDir(startDir) ?? process.cwd()
}
