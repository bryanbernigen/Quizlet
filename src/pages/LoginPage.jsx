import { useState } from 'react'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { KoreanFlag, IndonesianFlag } from '../components/Flag'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
}

export default function LoginPage() {
  const { login, loginAsGuest } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      await login(username, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleGuest = async () => {
    setError('')
    setLoading(true)
    try {
      await loginAsGuest()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    }}>
      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        style={{ width: '100%', maxWidth: 420 }}
      >
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 12, fontSize: '3rem' }}>
            <KoreanFlag size={48} /><IndonesianFlag size={48} />
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800 }}>
            <span className="gradient-text">KoreaQuiz</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>
            Korean-Indonesian Flashcard App
          </p>
        </div>

        <div className="glass-card" style={{ padding: 32 }}>
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label className="form-label">Username</label>
              <input
                className="form-input"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
                required
              />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Password</label>
              <input
                className="form-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
                required
              />
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  marginBottom: 20, padding: '10px 16px', borderRadius: 10,
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid var(--accent-red)',
                  color: 'var(--accent-red)', fontSize: '0.85rem', fontWeight: 600,
                }}
              >
                {error}
              </motion.div>
            )}

            <motion.button
              type="submit"
              className="btn-primary"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: '100%', padding: '14px 0', fontSize: '1rem',
                opacity: loading ? 0.7 : 1, textAlign: 'center',
              }}
            >
              {loading ? '...' : '🔑 Log In'}
            </motion.button>
          </form>

          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginBottom: 10 }}>
              or
            </div>
            <button
              type="button"
              onClick={handleGuest}
              disabled={loading}
              className="btn-secondary"
              style={{ width: '100%', padding: '12px 0', fontSize: '0.95rem', opacity: loading ? 0.7 : 1 }}
            >
              👋 Try as guest
            </button>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 8 }}>
              Explore for 1 hour — no signup. Sample sets included; data is cleared afterward.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
