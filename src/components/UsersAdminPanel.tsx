import { useCallback, useEffect, useState } from 'react'
import { authApi, type AuthUser } from '../api'

interface UsersAdminPanelProps {
  currentUserId: string
  onCurrentUserUpdated?: (user: AuthUser) => void
}

export function UsersAdminPanel({ currentUserId, onCurrentUserUpdated }: UsersAdminPanelProps) {
  const [users, setUsers] = useState<AuthUser[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createAccess, setCreateAccess] = useState<'member' | 'manager' | 'admin'>('member')
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  const [editDisplayName, setEditDisplayName] = useState('')
  const [editClubRole, setEditClubRole] = useState('')
  const [editBio, setEditBio] = useState('')
  const [editAccess, setEditAccess] = useState<'member' | 'manager' | 'admin'>('member')
  const [editPassword, setEditPassword] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editMsg, setEditMsg] = useState('')

  const loadUsers = useCallback(async () => {
    setListError('')
    setLoading(true)
    try {
      const { users: list } = await authApi.listUsers()
      setUsers(list)
    } catch (err) {
      setListError(err instanceof Error ? err.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const selected = selectedId ? users.find((u) => u.id === selectedId) : undefined

  useEffect(() => {
    if (!selected) return
    setEditDisplayName(selected.profile?.displayName ?? '')
    setEditClubRole(selected.profile?.clubRole ?? '')
    setEditBio(selected.profile?.bio ?? '')
    setEditAccess((selected.accessLevel as 'member' | 'manager' | 'admin') ?? 'member')
    setEditPassword('')
    setEditMsg('')
  }, [selected])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreateMsg('')
    setCreateBusy(true)
    try {
      await authApi.adminCreateUser({
        email: createEmail.trim(),
        password: createPassword,
        accessLevel: createAccess,
        displayName: createName.trim() || undefined,
      })
      setCreateEmail('')
      setCreatePassword('')
      setCreateName('')
      setCreateAccess('member')
      setCreateMsg('Account created.')
      await loadUsers()
    } catch (err) {
      setCreateMsg(err instanceof Error ? err.message : 'Create failed')
    } finally {
      setCreateBusy(false)
    }
  }

  async function handleEditSave(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedId) return
    setEditMsg('')
    setEditBusy(true)
    try {
      const body: Parameters<typeof authApi.adminUpdateUser>[1] = {
        displayName: editDisplayName,
        clubRole: editClubRole,
        bio: editBio,
        accessLevel: editAccess,
      }
      if (editPassword.trim()) body.password = editPassword.trim()

      const { user: updated } = await authApi.adminUpdateUser(selectedId, body)
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
      setEditPassword('')
      setEditMsg('Saved.')
      if (updated.id === currentUserId) onCurrentUserUpdated?.(updated)
    } catch (err) {
      setEditMsg(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setEditBusy(false)
    }
  }

  return (
    <div className="view">
      <header className="view-header">
        <div>
          <h2>Club accounts</h2>
          <p>Create logins, set permission levels, and edit profiles for other members.</p>
        </div>
      </header>

      <div className="view-grid">
        <section className="panel">
          <header className="panel-header">
            <h3>New account</h3>
            <p>Creates a user who can sign in with this email and password.</p>
          </header>
          <form className="form" onSubmit={(e) => void handleCreate(e)}>
            <label>
              <span>Email</span>
              <input
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                required
                autoComplete="off"
              />
            </label>
            <label>
              <span>Initial password</span>
              <input
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>Permission level</span>
              <select
                value={createAccess}
                onChange={(e) =>
                  setCreateAccess(e.target.value as 'member' | 'manager' | 'admin')
                }
              >
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label>
              <span>Display name (optional)</span>
              <input
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Full name"
              />
            </label>
            {createMsg && (
              <div
                className={
                  createMsg === 'Account created.' ? 'form-message success' : 'auth-error'
                }
              >
                {createMsg}
              </div>
            )}
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={createBusy}>
                {createBusy ? 'Creating…' : 'Create account'}
              </button>
            </div>
          </form>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3>All accounts</h3>
            <p>Select someone to edit their profile or permission level.</p>
          </header>
          {loading ? (
            <p className="empty-state">Loading…</p>
          ) : listError ? (
            <p className="auth-error">{listError}</p>
          ) : users.length === 0 ? (
            <p className="empty-state">No users yet.</p>
          ) : (
            <ul className="list compact">
              {users.map((u) => (
                <li
                  key={u.id}
                  className={
                    selectedId === u.id ? 'list-row selectable selected' : 'list-row selectable'
                  }
                  onClick={() => setSelectedId(u.id)}
                >
                  <div>
                    <div className="list-title">{u.email}</div>
                    <div className="list-meta">
                      <span>{u.profile?.displayName || 'No display name'}</span>
                      <span className="badge subtle">{u.accessLevel ?? 'member'}</span>
                      {u.id === currentUserId ? <span className="badge shared">You</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {selected && (
          <section className="panel span-2">
            <header className="panel-header">
              <h3>Edit account</h3>
              <p>
                {selected.email}
                {selected.id === currentUserId ? ' — this is your account.' : ''}
              </p>
            </header>
            <form className="form" onSubmit={(e) => void handleEditSave(e)}>
              <label>
                <span>Permission level</span>
                <select
                  value={editAccess}
                  onChange={(e) =>
                    setEditAccess(e.target.value as 'member' | 'manager' | 'admin')
                  }
                >
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label>
                <span>Display name</span>
                <input
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                />
              </label>
              <label>
                <span>Club role</span>
                <input
                  value={editClubRole}
                  onChange={(e) => setEditClubRole(e.target.value)}
                  placeholder="e.g. Mechanical lead"
                />
              </label>
              <label>
                <span>Bio</span>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                />
              </label>
              <label>
                <span>New password</span>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  autoComplete="new-password"
                />
              </label>
              {editMsg && (
                <div
                  className={editMsg === 'Saved.' ? 'form-message success' : 'auth-error'}
                >
                  {editMsg}
                </div>
              )}
              <div className="form-actions">
                <button type="submit" className="btn primary" disabled={editBusy}>
                  {editBusy ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </form>
          </section>
        )}
      </div>
    </div>
  )
}
