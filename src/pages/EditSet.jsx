import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useApiFetch } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function EditSet() {
  const { id } = useParams()
  const navigate = useNavigate()
  const apiFetch = useApiFetch()
  const [name, setName] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [cardDelimiter, setCardDelimiter] = useState('\\n')
  const [langDelimiter, setLangDelimiter] = useState(' - ')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  const parseDelimiter = (d) => {
    return d.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')
  }

  // Load existing set data
  useEffect(() => {
    const load = async () => {
      try {
        const [setsRes, cardsRes] = await Promise.all([
          apiFetch('/api/sets'),
          apiFetch(`/api/sets/${id}/cards`),
        ])
        const sets = await setsRes.json()
        const cards = await cardsRes.json()
        const set = sets.find(s => s.id === Number(id))
        if (set) {
          setName(set.name)
        }
        if (cards.length > 0) {
          // Reconstruct bulk text from cards
          const text = cards.map(c => `${c.front} - ${c.back}`).join('\n')
          setBulkText(text)
        }
      } catch (e) {
        console.error('Failed to load set:', e)
        setLoadError('Failed to load set. Please try again.')
      }
      setLoading(false)
    }
    load()
  }, [id])

  const parsedCards = useMemo(() => {
    if (!bulkText.trim()) return []
    const cardDel = parseDelimiter(cardDelimiter)
    const langDel = parseDelimiter(langDelimiter)

    const lines = bulkText.split(cardDel).filter(l => l.trim())
    return lines.map((line, i) => {
      const parts = line.split(langDel)
      return {
        index: i + 1,
        front: (parts[0] || '').trim(),
        back: (parts.slice(1).join(langDel) || '').trim(),
        valid: parts.length >= 2 && parts[0].trim() && parts.slice(1).join('').trim(),
      }
    })
  }, [bulkText, cardDelimiter, langDelimiter])

  const validCards = parsedCards.filter(c => c.valid)

  const handleSave = async () => {
    if (!name.trim() || validCards.length === 0) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await apiFetch(`/api/sets/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          cards: validCards.map(c => ({ front: c.front, back: c.back })),
        }),
      })
      if (res.ok) {
        navigate('/')
      } else {
        const data = await res.json()
        setSaveError(data.error || 'Failed to save. Please try again.')
      }
    } catch (e) {
      setSaveError('Network error. Please check your connection.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit"
        style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>⏳</div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading set...</p>
      </motion.div>
    )
  }

  if (loadError) {
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit"
        style={{ textAlign: 'center', paddingTop: 80 }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>⚠️</div>
        <p style={{ color: 'var(--accent-red)', marginBottom: 16 }}>{loadError}</p>
        <button className="btn-secondary" onClick={() => navigate('/')}>← Back to Dashboard</button>
      </motion.div>
    )
  }

  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
        <span className="gradient-text">Edit Set</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
        Modify your flashcard set — stats are preserved for unchanged cards
      </p>

      {/* Set Name */}
      <div style={{ marginBottom: 24 }}>
        <label className="form-label">Set Name</label>
        <input
          className="form-input"
          placeholder="e.g., Korean Greetings, Basic Verbs..."
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      {/* Delimiters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
        <div>
          <label className="form-label">Card Delimiter</label>
          <input
            className="form-input"
            value={cardDelimiter}
            onChange={e => setCardDelimiter(e.target.value)}
            placeholder="e.g., \\n for newline"
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>
            Separates each card (use \n for newline)
          </div>
        </div>
        <div>
          <label className="form-label">Language Delimiter</label>
          <input
            className="form-input"
            value={langDelimiter}
            onChange={e => setLangDelimiter(e.target.value)}
            placeholder="e.g., - or , or :"
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 6 }}>
            Separates Korean from Indonesian
          </div>
        </div>
      </div>

      {/* Bulk Text */}
      <div style={{ marginBottom: 32 }}>
        <label className="form-label">Flashcard Data</label>
        <textarea
          className="form-input"
          style={{ minHeight: 200, fontFamily: 'monospace', fontSize: '0.9rem' }}
          placeholder={`Example:\n안녕하세요 - Halo\n감사합니다 - Terima kasih`}
          value={bulkText}
          onChange={e => setBulkText(e.target.value)}
        />
      </div>

      {/* Live Preview */}
      {parsedCards.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700 }}>👁️ Live Preview</h2>
            <span style={{
              fontSize: '0.85rem',
              padding: '4px 12px',
              borderRadius: 20,
              background: validCards.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: validCards.length > 0 ? 'var(--accent-green)' : 'var(--accent-red)',
              fontWeight: 600,
            }}>
              {validCards.length} valid card{validCards.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="glass-card" style={{ overflow: 'hidden', maxHeight: 400, overflowY: 'auto' }}>
            <table className="preview-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Korean (Front)</th>
                  <th>Indonesian (Back)</th>
                  <th style={{ width: 80 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {parsedCards.map((card) => (
                  <tr key={card.index} style={{ opacity: card.valid ? 1 : 0.4 }}>
                    <td style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{card.index}</td>
                    <td style={{ fontWeight: 600 }}>{card.front || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{card.back || '—'}</td>
                    <td>
                      {card.valid ? (
                        <span style={{ color: 'var(--accent-green)', fontSize: '0.85rem' }}>✓</span>
                      ) : (
                        <span style={{ color: 'var(--accent-red)', fontSize: '0.85rem' }}>✗</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Save error */}
      {saveError && (
        <div style={{
          marginBottom: 16, padding: '10px 16px', borderRadius: 10,
          background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)',
          color: 'var(--accent-red)', fontSize: '0.9rem', fontWeight: 600,
        }}>
          {saveError}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 12 }}>
        <motion.button
          className="btn-primary"
          onClick={handleSave}
          disabled={!name.trim() || validCards.length === 0 || saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            opacity: (!name.trim() || validCards.length === 0 || saving) ? 0.5 : 1,
            cursor: (!name.trim() || validCards.length === 0 || saving) ? 'not-allowed' : 'pointer',
            fontSize: '1rem',
            padding: '14px 36px',
          }}
        >
          {saving ? '⏳ Saving...' : `💾 Update Set (${validCards.length} cards)`}
        </motion.button>
        <motion.button
          className="btn-secondary"
          onClick={() => navigate('/')}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ fontSize: '1rem', padding: '14px 28px' }}
        >
          ← Cancel
        </motion.button>
      </div>
    </motion.div>
  )
}
