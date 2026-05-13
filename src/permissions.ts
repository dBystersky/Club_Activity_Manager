export type AccessLevel = 'member' | 'manager' | 'admin'

export function normalizeAccessLevel(level: string | undefined | null): AccessLevel {
  if (level === 'admin' || level === 'manager' || level === 'member') return level
  return 'member'
}

export function canUseEventsAndSafety(level: AccessLevel) {
  return level !== 'member'
}

export function canViewBudgetSection(level: AccessLevel) {
  return level !== 'member'
}

export function canAddBudgetLineItems(level: AccessLevel) {
  return level === 'admin'
}

export function canEditEventCollaborators(level: AccessLevel) {
  return level === 'admin'
}

export function canCreateTasks(level: AccessLevel) {
  return level !== 'member'
}

export function canManageClubAccounts(level: AccessLevel) {
  return level === 'admin'
}
