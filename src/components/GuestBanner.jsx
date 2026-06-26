import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function remainingMs(expiresAt) {
  // expires_at may be ISO ('…T…Z') or SQL ('YYYY-MM-DD HH:MM:SS' in UTC).
  const normalized = expiresAt.includes('T') ? expiresAt : expiresAt.replace(' ', 'T') + 'Z'
  return new Date(normalized).getTime() - Date.now()
}

export default function GuestBanner() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [ms, setMs] = useState(() => (user?.expires_at ? remainingMs(user.expires_at) : 0))

  useEffect(() => {
    if (!user?.is_guest || !user?.expires_at) return
    const tick = () => setMs(remainingMs(user.expires_at))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [user])

  useEffect(() => {
    if (user?.is_guest && ms <= 0) {
      // logout may or may not return a promise; normalize so .finally is safe.
      Promise.resolve(logout()).finally(() => navigate('/'))
    }
  }, [ms, user, logout, navigate])

  if (!user?.is_guest) return null

  const total = Math.max(0, Math.floor(ms / 1000))
  const mm = String(Math.floor(total / 60)).padStart(2, '0')
  const ss = String(total % 60).padStart(2, '0')

  return (
    <div style={{
      background: 'rgba(245, 158, 11, 0.15)',
      borderBottom: '1px solid var(--accent-amber, #f59e0b)',
      color: 'var(--accent-amber, #f59e0b)',
      textAlign: 'center', padding: '8px 16px', fontSize: '0.85rem', fontWeight: 600,
    }}>
      👋 Guest session — {mm}:{ss} left · data will be cleared when the timer ends
    </div>
  )
}
