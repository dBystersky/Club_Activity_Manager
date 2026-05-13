import type { PlanningIssue } from '../planningConflicts'

type Props = { issues: PlanningIssue[] }

export function PlanningAlerts({ issues }: Props) {
  if (issues.length === 0) return null
  const conflicts = issues.filter((i) => i.severity === 'conflict')
  const warnings = issues.filter((i) => i.severity === 'warning')

  return (
    <div className="planning-alerts">
      {conflicts.length > 0 && (
        <div className="planning-block planning-block--error" role="alert">
          <div className="planning-block-title">Venue and resource conflicts</div>
          <ul className="planning-block-list">
            {conflicts.map((c, idx) => (
              <li key={`c-${idx}`}>{c.message}</li>
            ))}
          </ul>
          <p className="planning-block-hint">
            Saving is blocked until these are resolved or you adjust date, location, assignee, or
            team members.
          </p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="planning-block planning-block--warning">
          <div className="planning-block-title">Schedule notes</div>
          <ul className="planning-block-list">
            {warnings.map((w, idx) => (
              <li key={`w-${idx}`}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
