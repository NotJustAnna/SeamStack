/**
 * Lightweight semver-ish comparator for resolving dep version collisions during
 * package.json merging. We don't pull in a real semver lib; we just need a
 * total ordering of version specifiers like `^1.2.3`, `~1.2.0`, `1.2.3`, and
 * `workspace:*` so the merger picks deterministically.
 */

const SPECIAL_RANK: Record<string, number> = {
  'workspace:*': Number.POSITIVE_INFINITY,
  '*': Number.POSITIVE_INFINITY,
  latest: Number.POSITIVE_INFINITY,
  next: Number.POSITIVE_INFINITY - 1,
}

export function compareVersions(a: string, b: string): number {
  const ra = rank(a)
  const rb = rank(b)
  if (ra !== rb) return ra < rb ? -1 : 1
  const va = parse(a)
  const vb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (va[i] !== vb[i]) return va[i]! < vb[i]! ? -1 : 1
  }
  return 0
}

function rank(v: string): number {
  return SPECIAL_RANK[v] ?? 0
}

function parse(v: string): [number, number, number] {
  const stripped = v.replace(/^[^\d]+/, '')
  const parts = stripped.split('.', 3).map((p) => Number(p.replace(/[^\d].*$/, '')))
  return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
}
