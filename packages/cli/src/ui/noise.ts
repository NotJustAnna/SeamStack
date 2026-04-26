const filters: Record<string, RegExp[]> = {
  angular: [
    /^\s*➜?\s*press h \+ enter to show help/i,
    /^Help is available/i,
    /^Watch mode enabled\. Watching for file changes\./i,
  ],
  vite: [/^\s*➜?\s*press h \+ enter to show help/i],
}

const stripAnsi = (s: string): string =>
  s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '').trim()

/**
 * Should the given line for `member` be dropped from the rendered log?
 *
 * Returns true for known interactive prompts that don't apply when the seam
 * owns the CLI (vite/angular's `press h + enter` menu) and for empty lines
 * (collapses runs of blank lines).
 */
export function shouldDrop(member: string, text: string): boolean {
  const stripped = stripAnsi(text)
  if (stripped === '') return true
  const list = filters[member]
  if (!list) return false
  return list.some((re) => re.test(stripped))
}
