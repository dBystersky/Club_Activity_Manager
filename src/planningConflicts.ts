/** Normalise free-text venue or room names for comparison. */
export function normalizeVenue(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Normalise assignee labels (subteam names, people, etc.). */
export function normalizeAssignee(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

export type PlanningSeverity = 'conflict' | 'warning'

export interface PlanningIssue {
  severity: PlanningSeverity
  message: string
}

function isPlanningRelevantEvent(status: string): boolean {
  return status !== 'completed'
}

function dedupePush(issues: PlanningIssue[], seen: Set<string>, issue: PlanningIssue) {
  const key = `${issue.severity}:${issue.message}`
  if (seen.has(key)) return
  seen.add(key)
  issues.push(issue)
}

export type EventLike = {
  id: string
  name: string
  date: string
  location: string
  members: string[]
  status: string
}

/**
 * Detect venue double-booking (same calendar day + same location string),
 * same-day schedule density, and member overlap across events.
 */
export function analyzeEventConflicts(
  candidate: {
    date: string
    location: string
    members: string[]
    status: string
  },
  opts: {
    events: EventLike[]
    excludeEventId?: string
  },
): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  const seen = new Set<string>()
  const date = candidate.date?.trim()
  if (!date) return issues

  const locNorm = normalizeVenue(candidate.location)

  for (const e of opts.events) {
    if (opts.excludeEventId && e.id === opts.excludeEventId) continue
    if (!isPlanningRelevantEvent(e.status)) continue
    if (e.date !== date) continue

    const otherLoc = normalizeVenue(e.location)
    if (locNorm && otherLoc && locNorm === otherLoc) {
      dedupePush(
        issues,
        seen,
        {
          severity: 'conflict',
          message: `Venue clash: "${e.name}" already uses this location on ${date}.`,
        },
      )
    } else {
      dedupePush(
        issues,
        seen,
        {
          severity: 'warning',
          message: `Same day as "${e.name}"${e.location ? ` (${e.location})` : ''}.`,
        },
      )
    }
  }

  const candidateMembers = candidate.members
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)
  for (const email of candidateMembers) {
    for (const e of opts.events) {
      if (opts.excludeEventId && e.id === opts.excludeEventId) continue
      if (!isPlanningRelevantEvent(e.status)) continue
      if (e.date !== date) continue
      if (!e.members?.some((mem) => mem.trim().toLowerCase() === email)) continue
      dedupePush(
        issues,
        seen,
        {
          severity: 'conflict',
          message: `Resource clash: member ${email} is already listed on "${e.name}" the same day.`,
        },
      )
    }
  }

  return issues
}

export type TaskLike = {
  id: string
  title: string
  assignee: string
  dueDate: string
  completed: boolean
}

/**
 * Warn when an assignee already has open work due the same day, and when the due date
 * coincides with other active events (schedule awareness).
 */
export function analyzeTaskConflicts(
  candidate: {
    assignee: string
    dueDate: string
    eventId: string
  },
  opts: {
    tasks: TaskLike[]
    events: EventLike[]
    excludeTaskId?: string
  },
): PlanningIssue[] {
  const issues: PlanningIssue[] = []
  const seen = new Set<string>()
  const due = candidate.dueDate?.trim()
  if (!due) return issues

  const assigneeNorm = normalizeAssignee(candidate.assignee)
  if (assigneeNorm) {
    let count = 0
    const titles: string[] = []
    for (const t of opts.tasks) {
      if (opts.excludeTaskId && t.id === opts.excludeTaskId) continue
      if (t.completed) continue
      if (t.dueDate !== due) continue
      if (normalizeAssignee(t.assignee) !== assigneeNorm) continue
      count += 1
      if (titles.length < 3) titles.push(t.title)
    }
    if (count > 0) {
      dedupePush(
        issues,
        seen,
        {
          severity: 'conflict',
          message: `Resource clash: this assignee already has ${count} open task(s) due on ${due}${titles.length ? ` (e.g. ${titles.join('; ')})` : ''}.`,
        },
      )
    }
  }

  for (const e of opts.events) {
    if (!isPlanningRelevantEvent(e.status)) continue
    if (e.date !== due) continue
    if (candidate.eventId && e.id === candidate.eventId) continue
    dedupePush(
      issues,
      seen,
      {
        severity: 'warning',
        message: `Calendar note: "${e.name}" is scheduled on the same day as this due date.`,
      },
    )
  }

  return issues
}

