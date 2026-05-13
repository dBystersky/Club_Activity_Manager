import { useState } from 'react'
import { authApi, setToken, type AuthUser } from './api'
import logoImage from './assets/mdn-2-01.webp'

interface AuthScreenProps {
  onAuth: (user: AuthUser) => void
}

export function AuthScreen({ onAuth }: AuthScreenProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const { user, token } = await authApi.login(email, password)
      setToken(token)
      onAuth(user)
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
            <img className="logo-slot-auth" src={logoImage} alt="Monash Deep Neuron logo" />
          <div>
            <div className="auth-card-brand-title">
              <h1>Monash Deep <br /> Neuron</h1>
            </div>
          </div>
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
              placeholder="Your password"
              required
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? 'Please wait...' : 'Log in'}
          </button>
        </form>
      </div>
    </div>
  )
}
