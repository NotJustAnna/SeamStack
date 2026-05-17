import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { bundleRequire } from 'bundle-require'
import type { WeaveInput } from '@seamstack/core'

const CANDIDATES = ['seam.config.ts', 'seam.config.mts', 'seam.config.js', 'seam.config.mjs']

export interface LoadedConfig {
  readonly config: WeaveInput
  readonly configPath: string
}

export async function loadConfig(cwd: string, configFile?: string): Promise<LoadedConfig> {
  if (configFile) {
    const path = resolve(cwd, configFile)
    const { mod } = await bundleRequire({ filepath: path })
    const config = (mod.default ?? mod) as WeaveInput
    if (!config || !Array.isArray(config.fabric)) {
      throw new Error(
        `[seam] ${configFile} must export a defineWeave({ fabric, port? }) result.`,
      )
    }
    return { config, configPath: path }
  }
  for (const name of CANDIDATES) {
    const path = join(cwd, name)
    if (!existsSync(path)) continue
    const { mod } = await bundleRequire({ filepath: path })
    const config = (mod.default ?? mod) as WeaveInput
    if (!config || !Array.isArray(config.fabric)) {
      throw new Error(
        `[seam] ${name} must export a defineWeave({ fabric, port? }) result.`,
      )
    }
    return { config, configPath: resolve(path) }
  }
  throw new Error(
    `[seam] no seam.config.{ts,mts,js,mjs} found in ${cwd}.`,
  )
}
