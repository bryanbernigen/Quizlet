import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApiFetch } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [error, setError] = useState('')
  const apiFetch = useApiFetch()

  useEffect(() => {
    apiFetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {
      setError('Failed to load data. Please refresh the page.')
    })
  }, [apiFetch])

  const total = stats ? (stats.familiarity.familiar + stats.familiarity.neutral + stats.familiarity.unfamiliar) : 0

  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {/* Quick Actions */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
          <span className="gradient-text">Dashboard</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 28 }}>Your Korean-Indonesian learning hub</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <Link to="/manage" style={{ textDecoration: 'none' }}>
            <motion.div
              className="glass-card-strong"
              style={{ padding: '28px 24px', cursor: 'pointer', textAlign: 'center' }}
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📚</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Manage Sets</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>Create, edit & organize</div>
            </motion.div>
          </Link>

          <Link to="/review" style={{ textDecoration: 'none' }}>
            <motion.div
              className="glass-card-strong"
              style={{ padding: '28px 24px', cursor: 'pointer', textAlign: 'center' }}
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔄</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Review Now</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>Swipe to learn</div>
            </motion.div>
          </Link>

          <Link to="/quiz" style={{ textDecoration: 'none' }}>
            <motion.div
              className="glass-card-strong"
              style={{ padding: '28px 24px', cursor: 'pointer', textAlign: 'center' }}
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>✏️</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Take Quiz</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>Test spelling</div>
            </motion.div>
          </Link>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: 24, padding: '12px 20px', borderRadius: 12,
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)',
          color: 'var(--accent-red)', fontSize: '0.9rem', fontWeight: 600,
        }}>
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 20 }}>📊 Statistics</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
            <div className="glass-card stat-card">
              <div className="stat-value" style={{ color: 'var(--accent-purple)' }}>{stats.totalSets}</div>
              <div className="stat-label">Total Sets</div>
            </div>
            <div className="glass-card stat-card">
              <div className="stat-value" style={{ color: 'var(--accent-blue)' }}>{stats.totalCards}</div>
              <div className="stat-label">Total Cards</div>
            </div>
            <Link to="/words?filter=familiar" style={{ textDecoration: 'none' }}>
              <div className="glass-card stat-card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
                <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{stats.familiarity.familiar}</div>
                <div className="stat-label">Familiar</div>
              </div>
            </Link>
            <Link to="/words?filter=neutral" style={{ textDecoration: 'none' }}>
              <div className="glass-card stat-card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
                <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>{stats.familiarity.neutral}</div>
                <div className="stat-label">Neutral</div>
              </div>
            </Link>
            <Link to="/words?filter=unfamiliar" style={{ textDecoration: 'none' }}>
              <div className="glass-card stat-card" style={{ cursor: 'pointer', transition: 'transform 0.2s' }}>
                <div className="stat-value" style={{ color: 'var(--accent-red)' }}>{stats.familiarity.unfamiliar}</div>
                <div className="stat-label">Unfamiliar</div>
              </div>
            </Link>
          </div>

          {/* Familiarity Bar */}
          {total > 0 && (
            <div style={{ marginTop: 20 }}>
              <div className="progress-bar" style={{ height: 12, borderRadius: 6 }}>
                <div style={{ display: 'flex', height: '100%', borderRadius: 6, overflow: 'hidden' }}>
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(stats.familiarity.familiar / total) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} style={{ background: 'var(--accent-green)' }} />
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(stats.familiarity.neutral / total) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.1 }} style={{ background: 'var(--accent-amber)' }} />
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(stats.familiarity.unfamiliar / total) * 100}%` }} transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }} style={{ background: 'var(--accent-red)' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} /> Familiar
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-amber)', display: 'inline-block' }} /> Neutral
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block' }} /> Unfamiliar
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Trouble Words */}
      {stats && stats.troubleWords.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 20 }}>🔥 Trouble Words</h2>
          <div className="glass-card" style={{ overflow: 'hidden' }}>
            <table className="preview-table">
              <thead>
                <tr>
                  <th>#</th><th>Korean</th><th>Indonesian</th><th>Incorrect</th><th>Correct</th>
                </tr>
              </thead>
              <tbody>
                {stats.troubleWords.map((w, i) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--accent-red)', fontWeight: 700 }}>{i + 1}</td>
                    <td style={{ fontWeight: 600 }}>{w.front}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{w.back}</td>
                    <td style={{ color: 'var(--accent-red)' }}>{w.incorrect_count}</td>
                    <td style={{ color: 'var(--accent-green)' }}>{w.correct_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </motion.div>
  )
}
