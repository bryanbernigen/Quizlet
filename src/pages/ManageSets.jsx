import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import SetFilter, { useSetFilter } from '../components/SetFilter'
import { useApiFetch } from '../context/AuthContext'

function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500)
    return () => clearTimeout(t)
  }, [onDone])
  return (
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
      {message}
    </motion.div>
  )
}

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function ManageSets() {
  const [sets, setSets] = useState([])
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [toast, setToast] = useState('')
  const [togglingId, setTogglingId] = useState(null)
  const [selectedSet, setSelectedSet] = useState(null)
  const [setCards, setSetCards] = useState([])
  const [loadingCards, setLoadingCards] = useState(false)
  const apiFetch = useApiFetch()

  useEffect(() => {
    loadSets()
  }, [])

  const loadSets = () => {
    apiFetch('/api/sets').then(r => r.json()).then(setSets).catch(() => setError('Failed to load sets.'))
  }

  const openSetDetail = async (set) => {
    setSelectedSet(set)
    setLoadingCards(true)
    try {
      const res = await apiFetch(`/api/sets/${set.id}/cards`)
      const cards = await res.json()
      setSetCards(cards)
    } catch {
      setSetCards([])
    } finally {
      setLoadingCards(false)
    }
  }

  const closeSetDetail = () => {
    setSelectedSet(null)
    setSetCards([])
  }

  const toggleShare = async (set) => {
    setTogglingId(set.id)
    try {
      const res = await apiFetch(`/api/sets/${set.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !set.is_shared }),
      })
      const result = await res.json()
      if (res.ok) {
        setSets(prev => prev.map(s =>
          s.id === set.id
            ? { ...s, is_shared: !set.is_shared, share_token: result.shareToken }
            : s
        ))
        if (result.shareToken) {
          navigator.clipboard.writeText(`${window.location.origin}/shared/${result.shareToken}`)
          setToast('Link copied to clipboard!')
        } else {
          setToast('Sharing disabled')
        }
      }
    } catch (e) {
      setToast('Failed to update sharing')
    } finally {
      setTogglingId(null)
    }
  }

  const deleteSet = async (id) => {
    if (!confirm('Delete this set and all its cards?')) return
    await apiFetch(`/api/sets/${id}`, { method: 'DELETE' })
    const remaining = sets.filter(s => s.id !== id)
    setSets(remaining)
    if (page > Math.max(1, Math.ceil(remaining.length / PAGE_SIZE))) setPage(Math.max(1, Math.ceil(remaining.length / PAGE_SIZE)))
  }

  const { search, setSearch, sortBy, setSortBy, filteredSets } = useSetFilter(sets)

  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)
  useEffect(() => { setPage(1) }, [search, sortBy])

  const totalPages = Math.ceil(filteredSets.length / PAGE_SIZE)
  const paginatedSets = filteredSets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {toast && <Toast message={toast} onDone={() => setToast('')} />}

      {/* Set Detail Panel */}
      <AnimatePresence>
        {selectedSet && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeSetDetail}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }}
            />
            <motion.div
              key="panel"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              style={{
                position: 'fixed', top: 0, right: 0, bottom: 0,
                width: 'min(520px, 95vw)',
                background: 'var(--bg-primary)',
                borderLeft: '1px solid var(--border-glass)',
                zIndex: 201,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Header */}
              <div style={{ padding: '24px 28px', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                    <h2 style={{ fontWeight: 800, fontSize: '1.3rem', margin: 0 }}>{selectedSet.name}</h2>
                    {selectedSet.is_shared && (
                      <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)', fontWeight: 700 }}>Shared</span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                    {selectedSet.card_count} card{selectedSet.card_count !== 1 ? 's' : ''}
                    {selectedSet.updated_at && selectedSet.updated_at !== selectedSet.created_at
                      ? ` · Updated ${new Date(selectedSet.updated_at).toLocaleDateString()}`
                      : ` · Created ${new Date(selectedSet.created_at).toLocaleDateString()}`
                    }
                  </div>
                  {selectedSet.card_count > 0 && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: '0.8rem' }}>
                      <span style={{ color: 'var(--accent-green)' }}>● {selectedSet.familiar_count} familiar</span>
                      <span style={{ color: 'var(--accent-amber)' }}>● {selectedSet.neutral_count} neutral</span>
                      <span style={{ color: 'var(--accent-red)' }}>● {selectedSet.unfamiliar_count} unfamiliar</span>
                    </div>
                  )}
                </div>
                <button onClick={closeSetDetail} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '1.2rem', padding: 4, flexShrink: 0, marginLeft: 12 }}>
                  ✕
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ padding: '16px 28px', display: 'flex', gap: 10, flexWrap: 'wrap', borderBottom: '1px solid var(--border-glass)' }}>
                <a href={`/edit/${selectedSet.id}`} style={{ flex: 1, minWidth: 120, textDecoration: 'none' }}>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ width: '100%', padding: '10px 16px', borderRadius: 10, background: 'rgba(139, 92, 246, 0.12)', border: '1px solid rgba(139, 92, 246, 0.3)', color: 'var(--accent-purple)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✏️ Edit Set
                  </motion.button>
                </a>
                <a href={`/review?setIds=${selectedSet.id}`} style={{ flex: 1, minWidth: 120, textDecoration: 'none' }}>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ width: '100%', padding: '10px 16px', borderRadius: 10, background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    🔄 Review
                  </motion.button>
                </a>
                <a href={`/quiz?setIds=${selectedSet.id}`} style={{ flex: 1, minWidth: 120, textDecoration: 'none' }}>
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} style={{ width: '100%', padding: '10px 16px', borderRadius: 10, background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: 'var(--accent-amber)', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    ✏️ Take Quiz
                  </motion.button>
                </a>
              </div>

              {/* Card List */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
                <h3 style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1px' }}>Cards</h3>
                {loadingCards ? (
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', padding: 20 }}>Loading...</div>
                ) : setCards.length > 0 ? (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {setCards.map((c, i) => (
                      <div key={c.id} className="glass-card" style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{c.front}</div>
                            <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 2 }}>{c.back}</div>
                          </div>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>#{i + 1}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: 'var(--text-secondary)', fontWeight: 600, textAlign: 'center', padding: 20 }}>No cards in this set</div>
                )}
              </div>

              {/* Footer Actions */}
              <div style={{ padding: '16px 28px', borderTop: '1px solid var(--border-glass)', display: 'flex', gap: 10 }}>
                <motion.button
                  type="button"
                  className="btn-danger"
                  style={{ flex: 1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={async () => {
                    if (confirm('Delete this set and all its cards?')) {
                      await apiFetch(`/api/sets/${selectedSet.id}`, { method: 'DELETE' })
                      loadSets()
                      closeSetDetail()
                    }
                  }}
                >
                  Delete Set
                </motion.button>
                <a href={`/edit/${selectedSet.id}`} style={{ flex: 1, textDecoration: 'none' }}>
                  <motion.button type="button" className="btn-secondary" style={{ width: '100%' }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    Edit Cards
                  </motion.button>
                </a>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
            <span className="gradient-text">Manage Sets</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Create, edit, and organize your flashcard sets</p>
        </div>
        <motion.button
          className="btn-primary"
          onClick={() => setShowForm(v => !v)}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ fontSize: '0.95rem', padding: '12px 24px' }}
        >
          {showForm ? '← Cancel' : '+ New Set'}
        </motion.button>
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

      {/* Inline Create Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: 'hidden', marginBottom: 32 }}
          >
            <CreateSetForm onSuccess={() => { setShowForm(false); loadSets() }} onCancel={() => setShowForm(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sets List */}
      {sets.length > 0 ? (
        <>
          <div style={{ marginBottom: 16 }}>
            <SetFilter
              search={search} onSearchChange={setSearch}
              sortBy={sortBy} onSortChange={setSortBy}
              totalCount={sets.length} filteredCount={filteredSets.length}
            />
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {paginatedSets.length > 0 ? paginatedSets.map(s => (
              <motion.div
                key={s.id}
                className="glass-card"
                style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                onClick={() => openSetDetail(s)}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{s.name}</span>
                    {s.is_shared && (
                      <span style={{
                        fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20,
                        background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)',
                        color: 'var(--accent-green)', fontWeight: 700,
                      }}>
                        Shared
                      </span>
                    )}
                    {s.copied_count > 0 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {s.copied_count} cop{s.copied_count !== 1 ? 'ies' : 'y'}
                      </span>
                    )}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>
                    {s.card_count} card{s.card_count !== 1 ? 's' : ''}
                    {s.updated_at && s.updated_at !== s.created_at
                      ? ` · Updated ${new Date(s.updated_at).toLocaleDateString()}`
                      : ` · Created ${new Date(s.created_at).toLocaleDateString()}`
                    }
                  </div>
                  {s.card_count > 0 && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 6, fontSize: '0.75rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--accent-green)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-green)', display: 'inline-block' }} />{s.familiar_count}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--accent-amber)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-amber)', display: 'inline-block' }} />{s.neutral_count}
                      </span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--accent-red)' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block' }} />{s.unfamiliar_count}
                      </span>
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                  <motion.button
                    type="button"
                    title={s.is_shared ? 'Sharing is on — click to revoke' : 'Share this set'}
                    onClick={() => toggleShare(s)}
                    disabled={togglingId === s.id}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      padding: '8px 14px', borderRadius: 10,
                      background: s.is_shared ? 'rgba(16, 185, 129, 0.1)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${s.is_shared ? 'rgba(16, 185, 129, 0.35)' : 'var(--border-glass)'}`,
                      color: s.is_shared ? 'var(--accent-green)' : 'var(--text-secondary)',
                      fontWeight: 600, fontSize: '0.8rem',
                      cursor: togglingId === s.id ? 'default' : 'pointer',
                      fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', gap: 4,
                      opacity: togglingId === s.id ? 0.6 : 1,
                    }}
                  >
                    {s.is_shared ? '🔗' : '🔒'} {s.is_shared ? 'Shared' : 'Share'}
                  </motion.button>
                  <button className="btn-danger" onClick={() => deleteSet(s.id)}>Delete</button>
                </div>
              </motion.div>
            )) : (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-secondary)' }}>
                No sets match your search
              </div>
            )}
          </div>

          {totalPages > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 }}>
              <motion.button
                onClick={() => setPage(p => p - 1)}
                disabled={page === 1}
                whileHover={page !== 1 ? { scale: 1.05 } : {}}
                whileTap={page !== 1 ? { scale: 0.95 } : {}}
                style={{
                  padding: '8px 20px', borderRadius: 10,
                  background: page === 1 ? 'transparent' : 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid var(--border-glass)',
                  color: page === 1 ? 'var(--text-secondary)' : 'var(--accent-purple)',
                  fontWeight: 600, fontSize: '0.85rem',
                  cursor: page === 1 ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: page === 1 ? 0.4 : 1,
                }}
              >
                ← Prev
              </motion.button>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, minWidth: 90, textAlign: 'center' }}>
                Page {page} of {totalPages}
              </span>
              <motion.button
                onClick={() => setPage(p => p + 1)}
                disabled={page === totalPages}
                whileHover={page !== totalPages ? { scale: 1.05 } : {}}
                whileTap={page !== totalPages ? { scale: 0.95 } : {}}
                style={{
                  padding: '8px 20px', borderRadius: 10,
                  background: page === totalPages ? 'transparent' : 'rgba(139, 92, 246, 0.1)',
                  border: '1px solid var(--border-glass)',
                  color: page === totalPages ? 'var(--text-secondary)' : 'var(--accent-purple)',
                  fontWeight: 600, fontSize: '0.85rem',
                  cursor: page === totalPages ? 'default' : 'pointer',
                  fontFamily: 'inherit', opacity: page === totalPages ? 0.4 : 1,
                }}
              >
                Next →
              </motion.button>
            </div>
          )}
        </>
      ) : (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '3rem', marginBottom: 16 }}>📚</div>
          <h3 style={{ fontWeight: 700, marginBottom: 8 }}>No sets yet</h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24 }}>Create your first flashcard set to get started</p>
          <motion.button
            className="btn-primary"
            onClick={() => setShowForm(true)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            + Create Your First Set
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}

function CreateSetForm({ onSuccess, onCancel }) {
  const apiFetch = useApiFetch()
  const [name, setName] = useState('')
  const [bulkText, setBulkText] = useState('')
  const [cardDelimiter, setCardDelimiter] = useState('\\n')
  const [langDelimiter, setLangDelimiter] = useState(' - ')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  const parseDelimiter = (d) => d.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '\r')

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

  const handleSubmit = async () => {
    if (!name.trim() || validCards.length === 0) return
    setSaving(true)
    setSaveError('')
    try {
      const res = await apiFetch('/api/sets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), cards: validCards.map(c => ({ front: c.front, back: c.back })) }),
      })
      if (res.ok) {
        onSuccess()
      } else {
        const data = await res.json()
        setSaveError(data.error || 'Failed to save.')
      }
    } catch (e) {
      setSaveError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="glass-card-strong" style={{ padding: '28px 32px', marginTop: 8 }}>
      <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 20 }}>+ Create New Set</h3>

      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Set Name</label>
        <input className="form-input" placeholder="e.g., Korean Greetings, Basic Verbs..." value={name} onChange={e => setName(e.target.value)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label className="form-label">Card Delimiter</label>
          <input className="form-input" value={cardDelimiter} onChange={e => setCardDelimiter(e.target.value)} placeholder="\\n for newline" />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Separates each card</div>
        </div>
        <div>
          <label className="form-label">Language Delimiter</label>
          <input className="form-input" value={langDelimiter} onChange={e => setLangDelimiter(e.target.value)} placeholder="- or , or :" />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Separates Korean from Indonesian</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Paste Flashcard Data</label>
        <textarea
          className="form-input"
          style={{ minHeight: 140, fontFamily: 'monospace', fontSize: '0.88rem' }}
          placeholder={`Example:\n안녕하세요 - Halo\n감사합니다 - Terima kasih\n사랑해 - Aku cinta kamu`}
          value={bulkText} onChange={e => setBulkText(e.target.value)}
        />
      </div>

      {parsedCards.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Preview</span>
            <span style={{
              fontSize: '0.8rem', padding: '3px 10px', borderRadius: 20,
              background: validCards.length > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: validCards.length > 0 ? 'var(--accent-green)' : 'var(--accent-red)', fontWeight: 600,
            }}>
              {validCards.length} valid card{validCards.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ maxHeight: 180, overflowY: 'auto', borderRadius: 10, border: '1px solid var(--border-glass)' }}>
            <table className="preview-table" style={{ margin: 0 }}>
              <thead><tr><th>#</th><th>Korean</th><th>Indonesian</th><th>Status</th></tr></thead>
              <tbody>
                {parsedCards.map(c => (
                  <tr key={c.index} style={{ opacity: c.valid ? 1 : 0.4 }}>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.index}</td>
                    <td style={{ fontWeight: 600 }}>{c.front || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{c.back || '—'}</td>
                    <td>{c.valid ? <span style={{ color: 'var(--accent-green)' }}>✓</span> : <span style={{ color: 'var(--accent-red)' }}>✗</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {saveError && (
        <div style={{ marginBottom: 12, padding: '8px 14px', borderRadius: 8, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: '0.85rem', fontWeight: 600 }}>
          {saveError}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <motion.button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!name.trim() || validCards.length === 0 || saving}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ opacity: (!name.trim() || validCards.length === 0 || saving) ? 0.5 : 1, cursor: (!name.trim() || validCards.length === 0 || saving) ? 'not-allowed' : 'pointer', fontSize: '0.9rem', padding: '10px 24px' }}
        >
          {saving ? '⏳ Saving...' : `💾 Save Set (${validCards.length} cards)`}
        </motion.button>
        <motion.button
          className="btn-secondary"
          onClick={onCancel}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{ fontSize: '0.9rem', padding: '10px 20px' }}
        >
          Cancel
        </motion.button>
      </div>
    </div>
  )
}
