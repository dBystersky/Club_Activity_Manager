import { useMemo, useState } from 'react'
import type { ResourceDoc } from '../api'

export type EventForResourceLock = {
  id: string
  name: string
  status: string
  resourceIds?: string[]
}

/** IDs booked by another non-completed event (excluding excludeEventId). */
export function lockedResourcesForOtherEvents(
  events: EventForResourceLock[],
  excludeEventId?: string,
): Map<string, string> {
  const m = new Map<string, string>()
  for (const e of events) {
    if (e.status === 'completed') continue
    if (excludeEventId && e.id === excludeEventId) continue
    for (const rid of e.resourceIds ?? []) {
      if (!m.has(rid)) m.set(rid, e.name)
    }
  }
  return m
}

/**
 * Resources tied to other active events cannot be picked unless this task is linked to that same event.
 */
export function lockedResourcesForTaskContext(
  events: EventForResourceLock[],
  linkedEventId: string,
): Map<string, string> {
  const link = linkedEventId.trim()
  const m = new Map<string, string>()
  for (const e of events) {
    if (e.status === 'completed') continue
    if (link && e.id === link) continue
    for (const rid of e.resourceIds ?? []) {
      if (!m.has(rid)) m.set(rid, e.name)
    }
  }
  return m
}

export function ResourceAssignPicker({
  resources,
  value,
  onChange,
  lockedByOtherEvents,
  hint,
}: {
  resources: ResourceDoc[]
  value: string[]
  onChange: (ids: string[]) => void
  lockedByOtherEvents: Map<string, string>
  hint?: string
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()

  const suggestions = useMemo(() => {
    const chosen = new Set(value)
    return resources
      .filter((r) => {
        if (chosen.has(r.id)) return false
        if (lockedByOtherEvents.has(r.id)) return false
        if (!q) return false
        const hay = `${r.name} ${r.type} ${r.storageLocation}`.toLowerCase()
        return hay.includes(q)
      })
      .slice(0, 12)
  }, [resources, value, lockedByOtherEvents, q])

  const catalogById = useMemo(() => new Map(resources.map((r) => [r.id, r])), [resources])

  function assign(id: string) {
    if (lockedByOtherEvents.has(id) || value.includes(id)) return
    onChange([...value, id])
    setQuery('')
  }

  function unassign(id: string) {
    onChange(value.filter((x) => x !== id))
  }

  if (resources.length === 0) {
    return (
      <p className="form-hint">
        No inventory items yet. Club admins can add resources under the Inventory tab.
      </p>
    )
  }

  return (
    <div className="resource-assign-picker">
      <span className="form-static-label">Resources & equipment</span>
      {hint ? <p className="form-hint">{hint}</p> : null}
      <input
        className="resource-assign-search"
        type="search"
        autoComplete="off"
        placeholder="Search by name, type or storage location…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search inventory to assign"
      />
      {q && suggestions.length === 0 ? (
        <p className="form-hint">No matching items, or everything usable is already assigned elsewhere.</p>
      ) : null}
      {suggestions.length > 0 ? (
        <ul className="resource-assign-suggestions">
          {suggestions.map((r) => (
            <li key={r.id}>
              <button type="button" className="resource-assign-pick" onClick={() => assign(r.id)}>
                <span className="resource-assign-pick-title">{r.name}</span>
                <span className="resource-assign-pick-meta">
                  {[r.type, r.storageLocation].filter(Boolean).join(' · ') || 'Inventory'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {value.length > 0 ? (
        <ul className="resource-assign-chips" aria-label="Assigned resources">
          {value.map((id) => {
            const r = catalogById.get(id)
            const label = r?.name ?? id
            return (
              <li key={id}>
                <span className="resource-assign-chip">
                  <span className="resource-assign-chip-label">{label}</span>
                  <button type="button" className="resource-assign-chip-remove" onClick={() => unassign(id)}>
                    ×
                  </button>
                </span>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="form-hint">No resources assigned yet — search above to add.</p>
      )}
    </div>
  )
}
