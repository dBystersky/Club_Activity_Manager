import { useState } from 'react'
import { authApi, setToken, type AuthUser } from './api'

interface AuthScreenProps {
  onAuth: (user: AuthUser) => void
}

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [clubRole, setClubRole] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (mode === 'register') {
        const { user, token } = await authApi.register({
          email,
          password,
          displayName: displayName || undefined,
          clubRole: clubRole || undefined,
          bio: bio || undefined,
        })
        setToken(token)
        onAuth(user)
      } else {
        const { user, token } = await authApi.login(email, password)
        setToken(token)
        onAuth(user)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-card-brand">
          <div className="logo-slot logo-slot-lg" title="Logo" aria-label="Logo" />
          <div>
            <div className="auth-card-brand-title">
              <span className="brand-mark">✦</span>
              <h1>Robotics Club Planner</h1>
            </div>
            <p>Sign in or create an account to manage events and tasks.</p>
          </div>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@university.edu"
              required
            />
          </label>
          <label>
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'At least 6 characters' : ''}
              minLength={mode === 'register' ? 6 : undefined}
              required
            />
          </label>

          {mode === 'register' && (
            <>
              <label>
                <span>Display name (optional)</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </label>
              <label>
                <span>Club role (optional)</span>
                <input
                  type="text"
                  value={clubRole}
                  onChange={(e) => setClubRole(e.target.value)}
                  placeholder="e.g. Team Lead, Treasurer"
                />
              </label>
              <label>
                <span>Bio (optional)</span>
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="A bit about you..."
                  rows={2}
                />
              </label>
            </>
          )}

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  )
}
