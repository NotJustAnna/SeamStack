/**
 * Best-effort regex-based TypeScript type stripper. Lifted from
 * `scripts/generate-js-variants.ts` so the engine and the build script share
 * a single implementation. Sufficient for the kind of small, idiomatic starter
 * code each layer ships; not a real TS→JS compiler.
 */

export function stripTypes(source: string): string {
  let out = source
  // Generic type arguments after identifiers when followed by `(`: `useState<T>(...)`.
  out = out.replace(/\b([a-zA-Z_$][\w$]*)<[^<>()]+>(?=\()/g, '$1')
  // `(name as Type)` → `name`
  out = out.replace(/\(([a-zA-Z_$][\w$]*)\s+as\s+[A-Za-z_$][\w$.<>]*\)/g, '$1')
  // `... as { ... }`, `... as Promise<...>`, `... as Type`.
  out = out.replace(/\s+as\s+\{[^}]+\}/g, '')
  out = out.replace(/\s+as\s+Promise<[^>]+>/g, '')
  out = out.replace(/\s+as\s+[A-Za-z_$][\w$.]*/g, '')
  // Single-param type annotations: `(name: Type)` → `(name)`.
  out = out.replace(/\(([a-zA-Z_$][\w$]*)\s*:\s*[A-Za-z_$][\w$.]*\s*\)/g, '($1)')
  // Type-only imports.
  out = out.replace(/^import\s+type\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]\n?/gm, '')
  // String-literal source paths: './x.ts' → './x.js', './x.tsx' → './x.jsx'.
  out = out.replace(/(['"])(\.\.?\/[^'"]+)\.tsx(['"])/g, '$1$2.jsx$3')
  out = out.replace(/(['"])(\.\.?\/[^'"]+)\.ts(['"])/g, '$1$2.js$3')
  return out
}

export function stripTypesFromHtml(html: string): string {
  return html.replace(/\/main\.tsx/g, '/main.jsx').replace(/\/main\.ts(?=["'])/g, '/main.js')
}

/**
 * Renames a file's extension when stripping a TS layer to its JS sibling.
 * Returns the new basename for the JS variant.
 */
export function jsExtensionFor(filename: string): string {
  return filename.replace(/\.tsx$/, '.jsx').replace(/\.ts$/, '.js')
}
