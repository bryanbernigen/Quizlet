import { useState, useEffect } from 'react'
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApiFetch } from '../context/AuthContext'
import { useAuth } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function SharedSet() {
  const { shareToken } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const apiFetch = useApiFetch()
  const { user } = useAuth()

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copying, setCopying] = useState(false)
  const [copied, setCopied] = useState(false)
  const [toast, setToast] = useState('')

  useEffect(() => {
    fetch(`/api/shared/${shareToken}`)
      .then(r => {
        if (!r.ok) throw new Error('Set not found or no longer shared')
        return r.json()
      })
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [shareToken])

  const copyToMySets = async () => {
    if (!user) return
    setCopying(true)
    try {
      const res = await apiFetch(`/api/shared/${shareToken}/copy`, { method: 'POST' })
      const result = await res.json()
      if (res.ok) {
        showToast('Saved to your sets!')
        setTimeout(() => navigate('/manage'), 1500)
      } else {
        showToast(result.error || 'Failed to save')
      }
    } catch (e) {
      showToast('Network error')
    } finally {
      setCopying(false)
    }
  }

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2500)
  }

  if (loading) {
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
        <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Loading...</div>
      </motion.div>
    )
  }

  if (error) {
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit" style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: '4rem', marginBottom: 20 }}>🔗</div>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, marginBottom: 12 }}>
          <span className="gradient-text">Set Not Available</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>{error}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <Link to="/" className="btn-secondary" style={{ padding: '12px 24px', textDecoration: 'none' }}>Go to Dashboard</Link>
          {user && <Link to="/manage" style={{ padding: '12px 24px', textDecoration: 'none' }} className="btn-primary">Browse Sets</Link>}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {/* Toast */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          style={{
            position: 'fixed', top: 20, right: 20, zIndex: 1000,
            padding: '12px 20px', borderRadius: 12,
            background: 'rgba(16, 185, 129, 0.15)', border: '1px solid var(--accent-green)',
            color: 'var(--accent-green)', fontWeight: 700, fontSize: '0.9rem',
          }}
        >
          {toast}
        </motion.div>
      )}

      <div style={{ marginBottom: 8 }}>
        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--text-secondary)', fontWeight: 600 }}>
          Shared Flashcard Set
        </span>
      </div>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
        <span className="gradient-text">{data.set.name}</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
        {data.set.card_count} card{data.set.card_count !== 1 ? 's' : ''} · Shared set
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 40, flexWrap: 'wrap' }}>
        <Link to={`/review?sharedSet=${shareToken}`} style={{ textDecoration: 'none' }}>
          <motion.div
            className="glass-card-strong"
            style={{ padding: '24px 28px', cursor: 'pointer', textAlign: 'center', minWidth: 180 }}
            whileHover={{ scale: 1.03, y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>🔄</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Review</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>Swipe through cards</div>
          </motion.div>
        </Link>

        <Link to={`/quiz?sharedSet=${shareToken}`} style={{ textDecoration: 'none' }}>
          <motion.div
            className="glass-card-strong"
            style={{ padding: '24px 28px', cursor: 'pointer', textAlign: 'center', minWidth: 180 }}
            whileHover={{ scale: 1.03, y: -4 }}
            whileTap={{ scale: 0.98 }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>✏️</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Take Quiz</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>Test spelling</div>
          </motion.div>
        </Link>

        {user ? (
          <motion.div
            className="glass-card-strong"
            style={{ padding: '24px 28px', textAlign: 'center', minWidth: 200 }}
            whileHover={copying ? {} : { scale: 1.03, y: -4 }}
            whileTap={copying ? {} : { scale: 0.98 }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>💾</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
              {copying ? 'Saving...' : 'Save to My Sets'}
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>
              {copying ? 'Please wait...' : 'Add to your library'}
            </div>
            <button
              onClick={copyToMySets}
              disabled={copying}
              style={{
                marginTop: 12, padding: '8px 20px', borderRadius: 8,
                background: 'var(--gradient-main)', color: '#fff',
                fontWeight: 700, fontSize: '0.85rem', border: 'none',
                cursor: copying ? 'default' : 'pointer',
                opacity: copying ? 0.7 : 1,
                fontFamily: 'inherit',
              }}
            >
              {copying ? '⏳ Saving...' : 'Save'}
            </button>
          </motion.div>
        ) : (
          <motion.div
            className="glass-card-strong"
            style={{ padding: '24px 28px', textAlign: 'center', minWidth: 200 }}
          >
            <div style={{ fontSize: '2rem', marginBottom: 10 }}>💾</div>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>Save to My Sets</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>
              <Link to="/login" style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>Log in</Link> to save
            </div>
          </motion.div>
        )}
      </div>

      {/* Card preview */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>📋 Card Preview</h2>
        <div className="glass-card" style={{ overflow: 'hidden', maxHeight: 400, overflowY: 'auto' }}>
          <table className="preview-table">
            <thead>
              <tr>
                <th style={{ width: 50 }}>#</th>
                <th>Korean</th>
                <th>Indonesian</th>
              </tr>
            </thead>
            <tbody>
              {data.cards.map((c, i) => (
                <tr key={c.id}>
                  <td style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>{i + 1}</td>
                  <td style={{ fontWeight: 600 }}>{c.front}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{c.back}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </motion.div>
  )
}
