import { spawn } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import { relative } from 'node:path'
import * as p from '@clack/prompts'
import pc from 'picocolors'
import { composeProject } from './engine/index.js'
import type { ProjectSpec } from './engine/spec.js'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export interface ScaffoldInput {
  spec: ProjectSpec
  targetDir: string
  install: boolean
  git: boolean
  pm: PackageManager
  force: boolean
}

export async function scaffold(input: ScaffoldInput): Promise<void> {
  const writeSpin = p.spinner()
  writeSpin.start(`Tailoring ${pc.cyan(input.spec.name)}`)
  await fs.mkdir(input.targetDir, { recursive: true })
  await composeProject(input.spec, input.targetDir, {
    warn: (m) => writeSpin.message(pc.dim(m)),
  })
  const display = relative(process.cwd(), input.targetDir) || '.'
  writeSpin.stop(`Files written to ${pc.green(display)}`)

  if (input.git) {
    const gitSpin = p.spinner()
    gitSpin.start('Stitching the first commit')
    try {
      await runIn(input.targetDir, 'git', ['init', '-q'])
      await runIn(input.targetDir, 'git', ['add', '.'])
      await runIn(input.targetDir, 'git', [
        'commit',
        '-q',
        '-m',
        'Initial commit from create-seam',
      ])
      gitSpin.stop('Git repository initialized')
    } catch (err) {
      gitSpin.stop(pc.yellow(`Git init skipped: ${(err as Error).message}`))
    }
  }

  if (input.install) {
    const installSpin = p.spinner()
    installSpin.start(`Threading dependencies with ${pc.cyan(input.pm)}`)
    try {
      await runIn(input.targetDir, input.pm, ['install'])
      installSpin.stop('Dependencies installed')
    } catch (err) {
      installSpin.stop(pc.yellow(`Install failed: ${(err as Error).message}`))
    }
  }
}

function runIn(cwd: string, cmd: string, args: string[]): Promise<void> {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'ignore', 'pipe'],
      shell: process.platform === 'win32',
    })
    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.once('error', rej)
    child.once('close', (code) => {
      if (code === 0) res()
      else {
        const detail = stderr.trim().split('\n')[0]
        rej(
          new Error(
            detail
              ? `${cmd} exited with code ${code}: ${detail}`
              : `${cmd} exited with code ${code}`,
          ),
        )
      }
    })
  })
}

export function detectPackageManager(): PackageManager {
  const ua = process.env.npm_config_user_agent ?? ''
  if (ua.startsWith('pnpm')) return 'pnpm'
  if (ua.startsWith('yarn')) return 'yarn'
  if (ua.startsWith('bun')) return 'bun'
  if (ua.startsWith('npm')) return 'npm'
  return 'pnpm'
}

export async function isDirNonEmpty(dir: string): Promise<boolean> {
  if (!existsSync(dir)) return false
  try {
    const entries = await fs.readdir(dir)
    return entries.length > 0
  } catch {
    return false
  }
}
