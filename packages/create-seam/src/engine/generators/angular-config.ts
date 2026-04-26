import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { AngularConfigFragment } from '../manifest.js'

interface AngularJson {
  $schema?: string
  version: number
  newProjectRoot?: string
  projects: Record<string, AngularProject>
  cli?: Record<string, unknown>
}

interface AngularProject {
  projectType: string
  schematics?: Record<string, unknown>
  root: string
  sourceRoot: string
  prefix: string
  architect: Record<string, AngularArchitect>
}

interface AngularArchitect {
  builder: string
  options?: Record<string, unknown> & {
    assets?: unknown[]
    styles?: unknown[]
    scripts?: unknown[]
  }
  configurations?: Record<string, unknown>
  defaultConfiguration?: string
}

const PROJECT_NAME = 'app'

export function defaultAngularJson(): AngularJson {
  return {
    $schema: './node_modules/@angular/cli/lib/config/schema.json',
    version: 1,
    newProjectRoot: 'projects',
    projects: {
      [PROJECT_NAME]: {
        projectType: 'application',
        schematics: {},
        root: '',
        sourceRoot: 'src',
        prefix: 'app',
        architect: {
          build: {
            builder: '@angular/build:application',
            options: {
              outputPath: 'dist/app',
              index: 'src/index.html',
              browser: 'src/main.ts',
              polyfills: ['zone.js'],
              tsConfig: 'tsconfig.app.json',
              assets: [],
              styles: ['src/styles.css'],
              scripts: [],
            },
            configurations: {
              production: { outputHashing: 'all' },
              development: { optimization: false, extractLicenses: false, sourceMap: true },
            },
            defaultConfiguration: 'production',
          },
          serve: {
            builder: '@angular/build:dev-server',
            configurations: {
              production: { buildTarget: `${PROJECT_NAME}:build:production` },
              development: { buildTarget: `${PROJECT_NAME}:build:development` },
            },
            defaultConfiguration: 'development',
          },
        },
      },
    },
    cli: { analytics: false },
  }
}

export async function writeAngularJson(
  targetDir: string,
  fragments: AngularConfigFragment[],
): Promise<void> {
  const json = defaultAngularJson()
  const build = json.projects[PROJECT_NAME]!.architect.build!
  const opts = (build.options ??= {})

  for (const f of fragments) {
    if (f.buildOptionsPatch) {
      Object.assign(opts, f.buildOptionsPatch)
    }
    if (f.buildAssets) (opts.assets ??= []).push(...f.buildAssets)
    if (f.buildStyles) (opts.styles ??= []).push(...f.buildStyles)
    if (f.buildScripts) (opts.scripts ??= []).push(...f.buildScripts)
  }

  await fs.writeFile(join(targetDir, 'angular.json'), JSON.stringify(json, null, 2) + '\n', 'utf8')
}
