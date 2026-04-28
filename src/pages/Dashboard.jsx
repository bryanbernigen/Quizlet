import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import SetFilter, { useSetFilter } from '../components/SetFilter'
import { useApiFetch } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [sets, setSets] = useState([])
  const [error, setError] = useState('')
  const apiFetch = useApiFetch()

  useEffect(() => {
    Promise.all([
      apiFetch('/api/stats').then(r => r.json()),
      apiFetch('/api/sets').then(r => r.json()),
    ]).then(([s, setData]) => {
      setStats(s)
      setSets(setData)
    }).catch(() => {
      setError('Failed to load data. Please refresh the page.')
    })
  }, [apiFetch])

  const deleteSet = async (id) => {
    if (!confirm('Delete this set and all its cards?')) return
    await apiFetch(`/api/sets/${id}`, { method: 'DELETE' })
    const remaining = sets.filter(s => s.id !== id)
    setSets(remaining)
    // If current page is now beyond total pages, go back one
    const newTotalPages = Math.max(1, Math.ceil(remaining.length / PAGE_SIZE))
    if (page > newTotalPages) setPage(newTotalPages)
    apiFetch('/api/stats').then(r => r.json()).then(setStats)
  }

  const total = stats ? (stats.familiarity.familiar + stats.familiarity.neutral + stats.familiarity.unfamiliar) : 0
  const { search, setSearch, sortBy, setSortBy, filteredSets } = useSetFilter(sets)

  const PAGE_SIZE = 10
  const [page, setPage] = useState(1)

  useEffect(() => { setPage(1) }, [search, sortBy])

  const totalPages = Math.ceil(filteredSets.length / PAGE_SIZE)
  const paginatedSets = filteredSets.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {/* Quick Actions */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
          <span className="gradient-text">Dashboard</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 28 }}>Your Korean-Indonesian learning hub</p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <Link to="/create" style={{ textDecoration: 'none' }}>
            <motion.div
              className="glass-card-strong"
              style={{ padding: '28px 24px', cursor: 'pointer', textAlign: 'center' }}
              whileHover={{ scale: 1.03, y: -4 }}
              whileTap={{ scale: 0.98 }}
            >
              <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📝</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-primary)' }}>Add Set</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 4 }}>Import flashcards</div>
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

      {/* Sets List */}
      {sets.length > 0 && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>📚 Your Sets</h2>
          </div>
          <div style={{ marginBottom: 16 }}>
            <SetFilter
              search={search} onSearchChange={setSearch}
              sortBy={sortBy} onSortChange={setSortBy}
              totalCount={sets.length} filteredCount={filteredSets.length}
            />
          </div>
          <div style={{ display: 'grid', gap: 12 }}>
            {paginatedSets.map(s => (
              <motion.div
                key={s.id}
                className="glass-card"
                style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{s.name}</div>
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
                <div style={{ display: 'flex', gap: 8 }}>
                  <Link to={`/edit/${s.id}`} className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>✏️ Edit</Link>
                  <button className="btn-danger" onClick={() => deleteSet(s.id)}>Delete</button>
                </div>
              </motion.div>
            ))}
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
        </div>
      )}
    </motion.div>
  )
}
