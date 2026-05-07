import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useApiFetch } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

const FAMILIARITY_OPTIONS = [
  { value: '', label: 'All Words', color: 'var(--accent-purple)' },
  { value: 'familiar', label: 'Familiar', color: 'var(--accent-green)', emoji: '✅' },
  { value: 'neutral', label: 'Neutral', color: 'var(--accent-amber)', emoji: '➖' },
  { value: 'unfamiliar', label: 'Unfamiliar', color: 'var(--accent-red)', emoji: '❌' },
]

const FAMILIARITY_BADGE = {
  familiar: { label: 'Familiar', color: 'var(--accent-green)', bg: 'rgba(16, 185, 129, 0.15)' },
  neutral: { label: 'Neutral', color: 'var(--accent-amber)', bg: 'rgba(245, 158, 11, 0.15)' },
  unfamiliar: { label: 'Unfamiliar', color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.15)' },
}

export default function WordBrowser() {
  const [searchParams, setSearchParams] = useSearchParams()
  const initialFilter = searchParams.get('filter') || ''

  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterFamiliarity, setFilterFamiliarity] = useState(initialFilter)
  const [updatingId, setUpdatingId] = useState(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [total, setTotal] = useState(0)
  const apiFetch = useApiFetch()

  const fetchCards = async (famFilter, pageNum) => {
    setLoading(true)
    const url = famFilter
      ? `/api/cards/browse?familiarity=${famFilter}&page=${pageNum}`
      : `/api/cards/browse?page=${pageNum}`
    const res = await apiFetch(url)
    const result = await res.json()
    setCards(result.data || [])
    setTotal(result.pagination?.total || 0)
    setTotalPages(result.pagination?.totalPages || 0)
    setPage(result.pagination?.page || 1)
    setLoading(false)
  }

  useEffect(() => {
    setPage(1)
    fetchCards(filterFamiliarity, 1)
  }, [filterFamiliarity])

  const handleFilterChange = (value) => {
    setFilterFamiliarity(value)
    if (value) {
      setSearchParams({ filter: value })
    } else {
      setSearchParams({})
    }
  }

  const handleRecategorize = async (cardId, newFamiliarity) => {
    setUpdatingId(cardId)
    await apiFetch(`/api/cards/${cardId}/familiarity`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ familiarity: newFamiliarity }),
    })
    // Update locally
    setCards(prev => prev.map(c =>
      c.id === cardId ? { ...c, familiarity: newFamiliarity } : c
    ))
    setUpdatingId(null)
  }

  const filteredCards = useMemo(() => {
    if (!search.trim()) return cards
    const q = search.trim().toLowerCase()
    return cards.filter(c =>
      c.front.toLowerCase().includes(q) ||
      c.back.toLowerCase().includes(q) ||
      c.set_name.toLowerCase().includes(q)
    )
  }, [cards, search])

  // Group by set
  const groupedCards = useMemo(() => {
    const groups = {}
    filteredCards.forEach(c => {
      if (!groups[c.set_name]) groups[c.set_name] = []
      groups[c.set_name].push(c)
    })
    return groups
  }, [filteredCards])

  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
        <span className="gradient-text">Word Browser</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 28 }}>
        Browse, search, and recategorize your vocabulary
      </p>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {FAMILIARITY_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => handleFilterChange(opt.value)}
            style={{
              padding: '8px 18px',
              borderRadius: 10,
              border: '1px solid',
              borderColor: filterFamiliarity === opt.value ? opt.color : 'var(--border-glass)',
              background: filterFamiliarity === opt.value ? `${opt.color}18` : 'transparent',
              color: filterFamiliarity === opt.value ? opt.color : 'var(--text-secondary)',
              fontWeight: 600,
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.2s',
            }}
          >
            {opt.emoji ? `${opt.emoji} ` : ''}{opt.label}
            {filterFamiliarity === opt.value && totalPages > 0 && ` (${total})`}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 24 }}>
        <input
          className="form-input"
          placeholder="🔍 Search Korean, Indonesian, or set name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 500 }}
        />
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
          <p style={{ color: 'var(--text-secondary)' }}>Loading words...</p>
        </div>
      ) : filteredCards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>📭</div>
          <p style={{ color: 'var(--text-secondary)' }}>
            {search ? 'No words match your search' : 'No words in this category'}
          </p>
        </div>
      ) : (
        <div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 16 }}>
            Showing {filteredCards.length} of {total} word{total !== 1 ? 's' : ''}
            {search && ` matching "${search}"`}
            {totalPages > 1 && ` · Page ${page} of ${totalPages}`}
          </p>

          {Object.entries(groupedCards).map(([setName, setCards]) => (
            <div key={setName} style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                📚 {setName} ({setCards.length})
              </h3>
              <div className="glass-card" style={{ overflow: 'hidden' }}>
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Korean</th>
                      <th>Indonesian</th>
                      <th>Stats</th>
                      <th>Status</th>
                      <th style={{ width: 220 }}>Recategorize</th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {setCards.map(card => {
                        const badge = FAMILIARITY_BADGE[card.familiarity]
                        return (
                          <motion.tr
                            key={card.id}
                            layout
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0, x: -20 }}
                          >
                            <td style={{ fontWeight: 600 }}>{card.front}</td>
                            <td style={{ color: 'var(--text-secondary)' }}>{card.back}</td>
                            <td style={{ fontSize: '0.8rem' }}>
                              <span style={{ color: 'var(--accent-green)' }}>{card.correct_count}✓</span>
                              {' '}
                              <span style={{ color: 'var(--accent-red)' }}>{card.incorrect_count}✗</span>
                            </td>
                            <td>
                              <span style={{
                                padding: '3px 10px',
                                borderRadius: 6,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: badge.bg,
                                color: badge.color,
                              }}>
                                {badge.label}
                              </span>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                {['familiar', 'neutral', 'unfamiliar'].map(fam => {
                                  const isActive = card.familiarity === fam
                                  const b = FAMILIARITY_BADGE[fam]
                                  return (
                                    <button
                                      key={fam}
                                      onClick={() => !isActive && handleRecategorize(card.id, fam)}
                                      disabled={isActive || updatingId === card.id}
                                      style={{
                                        padding: '4px 10px',
                                        borderRadius: 6,
                                        border: isActive ? `1px solid ${b.color}` : '1px solid var(--border-glass)',
                                        background: isActive ? b.bg : 'transparent',
                                        color: isActive ? b.color : 'var(--text-secondary)',
                                        fontSize: '0.7rem',
                                        fontWeight: 600,
                                        cursor: isActive ? 'default' : 'pointer',
                                        opacity: (isActive || updatingId === card.id) ? 0.6 : 1,
                                        fontFamily: 'inherit',
                                        transition: 'all 0.2s',
                                      }}
                                    >
                                      {fam === 'familiar' ? '✅' : fam === 'neutral' ? '➖' : '❌'}
                                    </button>
                                  )
                                })}
                              </div>
                            </td>
                          </motion.tr>
                        )
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24 }}>
          <motion.button
            onClick={() => { setPage(p => p - 1); fetchCards(filterFamiliarity, page - 1) }}
            disabled={page <= 1}
            whileHover={page > 1 ? { scale: 1.05 } : {}}
            whileTap={page > 1 ? { scale: 0.95 } : {}}
            style={{
              padding: '8px 20px', borderRadius: 10,
              background: page <= 1 ? 'transparent' : 'rgba(139, 92, 246, 0.1)',
              border: '1px solid var(--border-glass)',
              color: page <= 1 ? 'var(--text-secondary)' : 'var(--accent-purple)',
              fontWeight: 600, fontSize: '0.85rem',
              cursor: page <= 1 ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            ← Prev
          </motion.button>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600, minWidth: 100, textAlign: 'center' }}>
            Page {page} of {totalPages}
          </span>
          <motion.button
            onClick={() => { setPage(p => p + 1); fetchCards(filterFamiliarity, page + 1) }}
            disabled={page >= totalPages}
            whileHover={page < totalPages ? { scale: 1.05 } : {}}
            whileTap={page < totalPages ? { scale: 0.95 } : {}}
            style={{
              padding: '8px 20px', borderRadius: 10,
              background: page >= totalPages ? 'transparent' : 'rgba(139, 92, 246, 0.1)',
              border: '1px solid var(--border-glass)',
              color: page >= totalPages ? 'var(--text-secondary)' : 'var(--accent-purple)',
              fontWeight: 600, fontSize: '0.85rem',
              cursor: page >= totalPages ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: page >= totalPages ? 0.4 : 1,
            }}
          >
            Next →
          </motion.button>
        </div>
      )}
    </motion.div>
  )
}
