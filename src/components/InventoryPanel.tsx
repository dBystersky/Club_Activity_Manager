import { useState } from 'react'
import { activitiesApi, type ResourceDoc } from '../api'

interface InventoryPanelProps {
  resources: ResourceDoc[]
  onChanged: () => void
  onError: (message: string | null) => void
}

export function InventoryPanel({ resources, onChanged, onError }: InventoryPanelProps) {
  const [name, setName] = useState('')
  const [storageLocation, setStorageLocation] = useState('')
  const [type, setType] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const n = name.trim()
    if (!n) return
    onError(null)
    setSubmitting(true)
    try {
      await activitiesApi.createResource({
        name: n,
        storageLocation: storageLocation.trim(),
        type: type.trim(),
      })
      setName('')
      setStorageLocation('')
      setType('')
      onChanged()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to create resource')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    const ok = window.confirm(
      'Delete this resource? It will be unlinked from any events and tasks that reference it.',
    )
    if (!ok) return
    onError(null)
    try {
      await activitiesApi.deleteResource(id)
      onChanged()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to delete resource')
    }
  }

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Inventory & resources</h2>
          <p>
            Track shared compute, datasets and lab assets. Only admins can add or remove items; anyone planning
            events or tasks can allocate existing resources.
          </p>
        </div>
      </header>

      <div className="view-grid">
        <section className="panel">
          <header className="panel-header">
            <h3>Add resource</h3>
            <p>Name, where it is stored, and category or type.</p>
          </header>
          <form className="form" onSubmit={handleCreate}>
            <label>
              <span>Name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Shared GPU workstation"
                required
              />
            </label>
            <label>
              <span>Storage location</span>
              <input
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
                placeholder="e.g. GPU lab rack 2"
              />
            </label>
            <label>
              <span>Type</span>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. Compute, dataset, software license"
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={submitting}>
                {submitting ? 'Saving…' : 'Create resource'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3>Resource list</h3>
            <p>Items stored in MongoDB for use across events and tasks.</p>
          </header>
          {resources.length === 0 ? (
            <p className="empty-state">No resources yet. Add GPUs, datasets or shared licenses above.</p>
          ) : (
            <ul className="list compact">
              {resources.map((r) => (
                <li key={r.id} className="list-row">
                  <div>
                    <div className="list-title">{r.name}</div>
                    <div className="list-meta">
                      {r.type ? <span>{r.type}</span> : null}
                      {r.storageLocation ? <span>{r.storageLocation}</span> : null}
                    </div>
                  </div>
                  <button type="button" className="btn danger" onClick={() => void handleDelete(r.id)}>
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
