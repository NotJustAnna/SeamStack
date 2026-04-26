import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { renderHbsFile, type TemplateContext } from '../template.js'

export interface CopyResult {
  /** Number of files copied (overwrites count once each). */
  files: number
}

export interface CopyOptions {
  /**
   * When set, files ending in `.hbs` are rendered through Handlebars with
   * this context; the `.hbs` suffix is stripped on output, and `.ts`/`.tsx`
   * templates are type-stripped when `context.isJs`.
   *
   * When unset, `.hbs` files are copied verbatim — useful for the build step
   * that mirrors layers into `dist/`.
   */
  templateContext?: TemplateContext
}

/**
 * Recursively copies `from` into `to`, overwriting on collisions. Skips
 * `node_modules`, `dist`, and dot-directories at every level so layer
 * source dirs that have local artifacts don't leak into the project.
 *
 * If a {@link CopyOptions.templateContext} is provided, `.hbs` files are
 * rendered with that context.
 */
export async function copyTree(
  from: string,
  to: string,
  opts: CopyOptions = {},
): Promise<CopyResult> {
  let files = 0
  const stat = await fs.stat(from).catch(() => null)
  if (!stat || !stat.isDirectory()) return { files }
  await fs.mkdir(to, { recursive: true })
  const entries = await fs.readdir(from, { withFileTypes: true })
  for (const entry of entries) {
    if (shouldSkip(entry.name, entry.isDirectory())) continue
    const src = join(from, entry.name)
    if (entry.isDirectory()) {
      const sub = await copyTree(src, join(to, entry.name), opts)
      files += sub.files
    } else if (entry.isFile()) {
      if (opts.templateContext && entry.name.endsWith('.hbs')) {
        const source = await fs.readFile(src, 'utf8')
        const { name, content } = renderHbsFile(entry.name, source, opts.templateContext)
        const dst = join(to, name)
        await fs.mkdir(dirname(dst), { recursive: true })
        await fs.writeFile(dst, content, 'utf8')
      } else {
        const dst = join(to, entry.name)
        await fs.mkdir(dirname(dst), { recursive: true })
        await fs.copyFile(src, dst)
      }
      files += 1
    }
  }
  return { files }
}

function shouldSkip(name: string, isDir: boolean): boolean {
  if (name === 'node_modules' || name === 'dist') return true
  if (isDir && name.startsWith('.')) return true
  if (/^seam\.config\.bundled_.*\.mjs$/.test(name)) return true
  return false
}
