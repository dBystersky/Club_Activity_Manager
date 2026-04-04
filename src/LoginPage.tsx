import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { AuthScreen } from './AuthScreen'
import { authApi, getToken } from './api'

export function LoginPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [alreadyIn, setAlreadyIn] = useState(false)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setChecking(false)
      return
    }
    authApi
      .me()
      .then(() => setAlreadyIn(true))
      .catch(() => {})
      .finally(() => setChecking(false))
  }, [])

  if (checking) {
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <p>Loading...</p>
        </div>
      </div>
    )
  }

  if (alreadyIn) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="auth-screen auth-screen-with-nav">
      <div className="auth-screen-top">
        <Link to="/" className="auth-back-link">
          ← Back to public calendar
        </Link>
      </div>
      <AuthScreen onAuth={() => navigate('/app', { replace: true })} />
    </div>
  )
}
