import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, inject, it } from 'vitest'
import { applyFilters, assertEnumerationValid, type MatrixSpec } from './helpers/enumerate.js'
import { buildExpectations } from './helpers/expectations.js'
import { runSeamBuild, scaffoldCombo } from './helpers/scaffold.js'
import { spawnSeam, type SeamProcess } from './helpers/spawn-seam.js'
import { waitForPortReleased } from './helpers/port.js'
import { probeAll, shutdownBrowser } from './helpers/probe.js'

const ALL_SPECS = applyFilters(assertEnumerationValid())

afterAll(async () => {
  await shutdownBrowser()
})

if (ALL_SPECS.length === 0) {
  describe('matrix-e2e', () => {
    it('no specs matched filter', () => {
      expect.fail(`MATRIX_FILTER='${process.env.MATRIX_FILTER ?? ''}' / MATRIX_SHARD='${process.env.MATRIX_SHARD ?? ''}' produced 0 specs`)
    })
  })
} else {
  describe(`matrix-e2e (${ALL_SPECS.length} combos)`, () => {
    for (const spec of ALL_SPECS) {
      runComboTest(spec)
    }
  })
}

function runComboTest(spec: MatrixSpec): void {
  describe.concurrent(`[T${spec.tier}] ${spec.comboId}`, () => {
    it('scaffold + install + build + start probe', async () => {
      const env = {
        registryUrl: inject('matrixRegistry'),
        matrixVersion: inject('matrixVersion'),
        token: inject('matrixToken'),
      }

      const scaffold = await scaffoldCombo(spec, env)
      const keep = process.env.MATRIX_KEEP_TMPDIR === '1'
      try {
        const build = await runSeamBuild(scaffold.tmpDir)
        if (build.exitCode !== 0) {
          throw new Error(`seam build exit=${build.exitCode}\n${build.log.slice(-4000)}`)
        }
        const expected = buildExpectations(spec)
        for (const a of expected.artifacts) {
          if (!existsSync(join(scaffold.tmpDir, a))) {
            throw new Error(`missing build artifact: ${a}`)
          }
        }

        await runServerPhase(spec, scaffold.tmpDir, scaffold.port, 'start')
        // `seam dev` is intentionally skipped from the matrix probe today: for
        // non-Vite hosts the dev server picks its own port (astro picks 4321 or
        // auto-bumps; angular's ng dev does the same) and the CLI doesn't yet
        // surface the chosen URL in a probe-friendly way. The build + start
        // probe + Playwright assertions already validate the produced bundle
        // boots and serves both the page and the API. Dev-mode coverage is
        // tracked as a follow-up — it needs CLI support to inject/announce a
        // port so we can wait+probe deterministically.
      } finally {
        if (!keep) await scaffold.cleanup()
        else process.stdout.write(`[matrix-e2e] keeping tmpDir for ${spec.comboId}: ${scaffold.tmpDir}\n`)
      }
    })
  })
}

async function runServerPhase(
  spec: MatrixSpec,
  tmpDir: string,
  port: number,
  phase: 'start' | 'dev',
): Promise<void> {
  let proc: SeamProcess | undefined
  try {
    proc = spawnSeam([phase], { cwd: tmpDir })
    let result
    try {
      result = await probeAll(spec, port)
    } catch (e) {
      const log = (proc.stdout() + '\n' + proc.stderr()).slice(-4000)
      throw new Error(`[${phase}] probe threw for ${spec.comboId}: ${(e as Error).message}\n--- seam log (tail) ---\n${log}\n--- tmpDir: ${tmpDir} ---`)
    }
    if (!result.http.ok || !result.browser.ok) {
      const log = (proc.stdout() + '\n' + proc.stderr()).slice(-4000)
      const reasons = [
        ...result.http.details.map((d) => `http: ${d}`),
        ...result.browser.details.map((d) => `browser: ${d}`),
      ].join('\n  ')
      throw new Error(`[${phase}] probe failed for ${spec.comboId}:\n  ${reasons}\n--- seam log (tail) ---\n${log}\n--- tmpDir: ${tmpDir} ---`)
    }
  } finally {
    if (proc) {
      await proc.kill()
      try { await waitForPortReleased(port, 10_000) } catch { /* port may be reused — best effort */ }
    }
  }
}
