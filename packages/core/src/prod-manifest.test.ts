import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveManifestDir } from './prod-manifest.js'

const originalArgv1 = process.argv[1]

afterEach(() => {
  process.argv[1] = originalArgv1 as string
})

describe('resolveManifestDir', () => {
  it('prefers the wire distDir when given, without touching the filesystem', () => {
    process.argv[1] = undefined as unknown as string
    expect(resolveManifestDir('/some/wire/dir')).toBe('/some/wire/dir')
  })

  it('walks up from the running entry to find _seam_prod.js when the wire is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seam-manifest-'))
    const serverDir = join(root, 'dist', 'server')
    const nestedEntryDir = join(serverDir, 'src')
    await mkdir(nestedEntryDir, { recursive: true })
    await writeFile(join(serverDir, '_seam_prod.js'), 'export default {}\n', 'utf8')

    process.argv[1] = join(nestedEntryDir, 'index.js')

    expect(resolveManifestDir(undefined)).toBe(serverDir)
  })

  it('falls back to process.cwd() when no manifest is found walking up', async () => {
    const root = await mkdtemp(join(tmpdir(), 'seam-manifest-empty-'))
    process.argv[1] = join(root, 'index.js')

    expect(resolveManifestDir(undefined)).toBe(process.cwd())
  })

  it('falls back to process.cwd() when process.argv[1] is unset', () => {
    process.argv[1] = undefined as unknown as string
    expect(resolveManifestDir(undefined)).toBe(process.cwd())
  })
})
