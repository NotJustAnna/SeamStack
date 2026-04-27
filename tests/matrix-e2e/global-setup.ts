import type { TestProject } from 'vitest/node'
import { startVerdaccio, type VerdaccioInstance } from './helpers/verdaccio.js'
import { publishWorkspace } from './helpers/publish.js'

let verdaccio: VerdaccioInstance | undefined

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  verdaccio = await startVerdaccio()
  const token = process.env.MATRIX_REGISTRY_TOKEN
  if (!token) throw new Error('MATRIX_REGISTRY_TOKEN missing after verdaccio start')

  const t0 = Date.now()
  const published = await publishWorkspace(verdaccio.url, token)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  process.stdout.write(
    `\n[matrix-e2e] verdaccio at ${verdaccio.url} — published ${published.packages.length} packages as ${published.matrixVersion} in ${elapsed}s\n`,
  )

  project.provide('matrixRegistry', verdaccio.url)
  project.provide('matrixVersion', published.matrixVersion)
  project.provide('matrixToken', token)
  process.env.MATRIX_VERSION = published.matrixVersion

  return async () => {
    if (verdaccio) {
      await verdaccio.shutdown()
      verdaccio = undefined
    }
  }
}

declare module 'vitest' {
  export interface ProvidedContext {
    matrixRegistry: string
    matrixVersion: string
    matrixToken: string
  }
}
