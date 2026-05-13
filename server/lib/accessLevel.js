/** Permission tier for club accounts (not the same as profile.clubRole). */
export function normalizeAccessLevel(user) {
  const v = user?.accessLevel
  if (v === 'admin' || v === 'manager' || v === 'member') return v
  return 'member'
}

export function membersListsEqual(a, b) {
  const norm = (arr) =>
    [...(arr || [])]
      .map((e) => String(e).trim().toLowerCase())
      .filter(Boolean)
      .sort()
  const x = norm(a)
  const y = norm(b)
  if (x.length !== y.length) return false
  return x.every((v, i) => v === y[i])
}

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
