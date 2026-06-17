import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import SetFilter, { useSetFilter } from '../components/SetFilter'
import CardFilters, { useCardFilters } from '../components/CardFilters'
import { KoreanFlag, IndonesianFlag } from '../components/Flag'
import { useApiFetch } from '../context/AuthContext'
import { useAuth } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function ReviewMode() {
  const [searchParams] = useSearchParams()
  const sharedSetToken = searchParams.get('sharedSet')
  const [sets, setSets] = useState([])
  const [selectedSets, setSelectedSets] = useState([])
  const [cardCount, setCardCount] = useState(10)
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isFlipped, setIsFlipped] = useState(false)
  const [started, setStarted] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [ratings, setRatings] = useState({}) // { [cardIndex]: 'familiar' | 'neutral' | 'unfamiliar' }
  const [swiping, setSwiping] = useState(false)
  const [exitDirection, setExitDirection] = useState({ x: 0, y: 0 })
  const [showCard, setShowCard] = useState(true)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [sharedSetInfo, setSharedSetInfo] = useState(null)
  const swipingRef = useRef(false)
  const [frontLang, setFrontLang] = useState('indonesian') // 'korean' or 'indonesian'
  const { familiarityFilter, attemptFilter, toggleFamiliarity, toggleAttempt, buildQueryParams } = useCardFilters()
  const apiFetch = useApiFetch()
  const { user } = useAuth()
  const isShared = !!sharedSetToken

  // Helper to get the displayed front/back based on frontLang
  const getFront = (c) => frontLang === 'korean' ? c.front : c.back
  const getBack = (c) => frontLang === 'korean' ? c.back : c.front
  const frontLabel = frontLang === 'korean'
    ? <><KoreanFlag /> Korean</>
    : <><IndonesianFlag /> Indonesian</>
  const backLabel = frontLang === 'korean'
    ? <><IndonesianFlag /> Indonesian</>
    : <><KoreanFlag /> Korean</>

  useEffect(() => {
    if (!isShared) {
      apiFetch('/api/sets').then(r => r.json()).then(allSets => {
        setSets(allSets)
        const setIdsParam = searchParams.get('setIds')
        if (setIdsParam) {
          const ids = setIdsParam.split(',').map(Number).filter(Boolean)
          setSelectedSets(ids)
        }
      })
    }
  }, [])

  const { search, setSearch, sortBy, setSortBy, filteredSets } = useSetFilter(sets)

  const toggleSet = (id) => {
    setSelectedSets(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const startReview = async () => {
    if (!isShared && selectedSets.length === 0) return
    setLoading(true)
    setLoadError('')
    try {
      let data
      if (isShared) {
        const res = await fetch(`/api/shared/${sharedSetToken}`)
        if (!res.ok) throw new Error('Shared set not found')
        const d = await res.json()
        setSharedSetInfo(d.set)
        data = d.cards
      } else {
        const filterParams = buildQueryParams()
        const url = `/api/cards/review?setIds=${selectedSets.join(',')}&count=${cardCount}${filterParams ? '&' + filterParams : ''}`
        const res = await apiFetch(url)
        data = await res.json()
      }
      if (data.length === 0) {
        setLoadError('No cards match your selected filters.')
        setLoading(false)
        return
      }
      setCards(data)
      setCurrentIndex(0)
      setIsFlipped(false)
      setStarted(true)
      setCompleted(false)
      setShowCard(true)
      setSwiping(false)
      swipingRef.current = false
      setRatings({})
    } catch (e) {
      setLoadError(e.message || 'Failed to load cards.')
    } finally {
      setLoading(false)
    }
  }

  const advanceCard = (familiarity) => {
    setRatings(prev => ({ ...prev, [currentIndex]: familiarity }))

    // Post familiarity update (only for authenticated users)
    if (user) {
      const card = cards[currentIndex]
      apiFetch(`/api/cards/${card.id}/familiarity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ familiarity }),
      })
    }

    if (currentIndex + 1 >= cards.length) {
      setCompleted(true)
    } else {
      // Hide card, wait, then show next
      setShowCard(false)
      setTimeout(() => {
        setCurrentIndex(prev => prev + 1)
        setIsFlipped(false)
        setSwiping(false)
        swipingRef.current = false
        setShowCard(true)
      }, 350)
    }
  }

  const handleSwipe = (familiarity, dirX, dirY) => {
    if (swipingRef.current) return
    swipingRef.current = true
    setSwiping(true)
    setExitDirection({ x: dirX, y: dirY })

    // Let the exit animation play, then advance
    setTimeout(() => {
      advanceCard(familiarity)
    }, 50)
  }

  const handleButtonSwipe = (familiarity) => {
    const dirs = {
      unfamiliar: { x: -600, y: 0 },
      neutral: { x: 0, y: -600 },
      familiar: { x: 600, y: 0 },
    }
    handleSwipe(familiarity, dirs[familiarity].x, dirs[familiarity].y)
  }

  const goPrev = () => {
    if (swiping || editing || currentIndex === 0) return
    setIsFlipped(false)
    setEditing(false)
    setCurrentIndex(prev => prev - 1)
  }

  const goNext = () => {
    if (swiping || editing || currentIndex >= cards.length - 1) return
    setIsFlipped(false)
    setEditing(false)
    setCurrentIndex(prev => prev + 1)
  }

  const totalAvailableCards = sets
    .filter(s => selectedSets.includes(s.id))
    .reduce((sum, s) => sum + s.card_count, 0);

  const card = cards[currentIndex]

  const results = { familiar: 0, neutral: 0, unfamiliar: 0 }
  Object.values(ratings).forEach(f => { if (results[f] !== undefined) results[f]++ })

  // Setup screen
  if (!started) {
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
          <span className="gradient-text">Review Mode</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>
          {isShared ? 'Reviewing shared set' : 'Swipe cards to rate your familiarity'}
        </p>

        {isShared ? (
          // Shared set: simplified setup
          <div style={{ maxWidth: 500 }}>
            {loadError && (
              <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: '0.9rem', fontWeight: 600 }}>
                {loadError}
              </div>
            )}
            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Show First</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <motion.button
                  type="button"
                  onClick={() => setFrontLang('indonesian')}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 12,
                    background: frontLang === 'indonesian' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${frontLang === 'indonesian' ? 'var(--accent-purple)' : 'var(--border-glass)'}`,
                    color: frontLang === 'indonesian' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                    fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <IndonesianFlag size={18} /> Indonesian
                </motion.button>
                <motion.button
                  type="button"
                  onClick={() => setFrontLang('korean')}
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 12,
                    background: frontLang === 'korean' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                    border: `1px solid ${frontLang === 'korean' ? 'var(--accent-purple)' : 'var(--border-glass)'}`,
                    color: frontLang === 'korean' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                    fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  }}
                >
                  <KoreanFlag size={18} /> Korean
                </motion.button>
              </div>
            </div>
            {!user && (
              <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 10, background: 'rgba(139, 92, 246, 0.08)', border: '1px solid rgba(139, 92, 246, 0.2)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <Link to="/login" style={{ color: 'var(--accent-purple)', fontWeight: 700 }}>Log in</Link> to save your progress
              </div>
            )}
            <motion.button
              className="btn-primary"
              onClick={startReview}
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ fontSize: '1rem', padding: '14px 36px', opacity: loading ? 0.5 : 1 }}
            >
              {loading ? '⏳ Loading...' : '🚀 Start Review'}
            </motion.button>
          </div>
        ) : (
          // Normal: set selection
          <>
            <div style={{ marginBottom: 24 }}>
              <label className="form-label">Select Sets</label>
              {sets.length === 0 ? (
                <p style={{ color: 'var(--text-secondary)' }}>No sets found. Create one first!</p>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                    <SetFilter
                      search={search} onSearchChange={setSearch}
                      sortBy={sortBy} onSortChange={setSortBy}
                      totalCount={sets.length} filteredCount={filteredSets.length}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <motion.button
                        type="button"
                        onClick={() => {
                          const allSelected = filteredSets.every(s => selectedSets.includes(s.id))
                          if (allSelected) {
                            setSelectedSets(prev => prev.filter(id => !filteredSets.some(f => f.id === id)))
                          } else {
                            setSelectedSets(prev => [...new Set([...prev, ...filteredSets.map(s => s.id)])])
                          }
                        }}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        style={{
                          padding: '6px 14px', borderRadius: 8,
                          background: 'rgba(139, 92, 246, 0.12)',
                          border: '1px solid rgba(139, 92, 246, 0.35)',
                          color: 'var(--accent-purple)',
                          fontSize: '0.78rem', fontWeight: 700,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {filteredSets.every(s => selectedSets.includes(s.id)) ? 'Deselect All' : 'Select All'}
                      </motion.button>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                        {selectedSets.length} selected
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
                    {filteredSets.map(s => (
                      <label key={s.id} className="set-checkbox" style={selectedSets.includes(s.id) ? { background: 'rgba(139, 92, 246, 0.12)', borderColor: 'rgba(139, 92, 246, 0.4)' } : {}}>
                        <input
                          type="checkbox"
                          checked={selectedSets.includes(s.id)}
                          onChange={() => toggleSet(s.id)}
                        />
                        <div>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: 8 }}>({s.card_count} cards)</span>
                          {s.card_count > 0 && (
                            <div style={{ display: 'flex', gap: 8, marginTop: 3, fontSize: '0.7rem' }}>
                              <span style={{ color: 'var(--accent-green)' }}>●{s.familiar_count}</span>
                              <span style={{ color: 'var(--accent-amber)' }}>●{s.neutral_count}</span>
                              <span style={{ color: 'var(--accent-red)' }}>●{s.unfamiliar_count}</span>
                            </div>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>

            <CardFilters
              familiarityFilter={familiarityFilter}
              attemptFilter={attemptFilter}
              onToggleFamiliarity={toggleFamiliarity}
              onToggleAttempt={toggleAttempt}
            />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32, maxWidth: 420 }}>
              <div>
                <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Number of Cards
                  {selectedSets.length > 0 && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {totalAvailableCards} available
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="number"
                    className="form-input"
                    style={{ flex: 1 }}
                    value={cardCount}
                    onChange={e => setCardCount(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                  />
                  <motion.button
                    type="button"
                    onClick={() => setCardCount(totalAvailableCards)}
                    disabled={selectedSets.length === 0}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      padding: '0 14px', borderRadius: 12,
                      background: 'rgba(139, 92, 246, 0.1)',
                      border: '1px solid var(--border-glass)',
                      color: 'var(--accent-purple)',
                      fontSize: '0.8rem', fontWeight: 700,
                      cursor: 'pointer', opacity: selectedSets.length === 0 ? 0.5 : 1,
                      fontFamily: 'inherit',
                    }}
                  >
                    ALL
                  </motion.button>
                </div>
              </div>
              <div>
                <label className="form-label">Show First</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <motion.button
                    type="button"
                    onClick={() => setFrontLang('indonesian')}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 12,
                      background: frontLang === 'indonesian' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${frontLang === 'indonesian' ? 'var(--accent-purple)' : 'var(--border-glass)'}`,
                      color: frontLang === 'indonesian' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                      fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <IndonesianFlag size={18} /> Indonesian
                  </motion.button>
                  <motion.button
                    type="button"
                    onClick={() => setFrontLang('korean')}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    style={{
                      flex: 1, padding: '10px 8px', borderRadius: 12,
                      background: frontLang === 'korean' ? 'rgba(139, 92, 246, 0.2)' : 'rgba(255,255,255,0.05)',
                      border: `1px solid ${frontLang === 'korean' ? 'var(--accent-purple)' : 'var(--border-glass)'}`,
                      color: frontLang === 'korean' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                      fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <KoreanFlag size={18} /> Korean
                  </motion.button>
                </div>
              </div>
            </div>

            {loadError && (
              <div style={{ marginBottom: 16, padding: '10px 16px', borderRadius: 10, background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)', color: 'var(--accent-red)', fontSize: '0.9rem', fontWeight: 600 }}>
                {loadError}
              </div>
            )}

            <motion.button
              className="btn-primary"
              onClick={startReview}
              disabled={selectedSets.length === 0 || loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{ opacity: (selectedSets.length === 0 || loading) ? 0.5 : 1, fontSize: '1rem', padding: '14px 36px' }}
            >
              {loading ? '⏳ Loading...' : '🚀 Start Review'}
            </motion.button>
          </>
        )}
      </motion.div>
    )
  }

  // Completed screen
  if (completed) {
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit"
        style={{ textAlign: 'center', paddingTop: 60 }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          style={{ fontSize: '4rem', marginBottom: 24 }}
        >
          🎉
        </motion.div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 32 }}>
          <span className="gradient-text">Review Complete!</span>
        </h1>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, maxWidth: 500, margin: '0 auto 40px' }}>
          <div className="glass-card stat-card">
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{results.familiar}</div>
            <div className="stat-label">Familiar</div>
          </div>
          <div className="glass-card stat-card">
            <div className="stat-value" style={{ color: 'var(--accent-amber)' }}>{results.neutral}</div>
            <div className="stat-label">Neutral</div>
          </div>
          <div className="glass-card stat-card">
            <div className="stat-value" style={{ color: 'var(--accent-red)' }}>{results.unfamiliar}</div>
            <div className="stat-label">Not Familiar</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {isShared ? (
            <>
              <motion.button className="btn-primary" onClick={() => { setStarted(false); setCompleted(false) }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                ← Back
              </motion.button>
              <a href={`/shared/${sharedSetToken}`} style={{ textDecoration: 'none' }}>
                <motion.button className="btn-secondary" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                  🔗 View Set
                </motion.button>
              </a>
              {user ? (
                <a href="/manage" style={{ textDecoration: 'none' }}>
                  <motion.button className="btn-secondary" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    💾 My Sets
                  </motion.button>
                </a>
              ) : (
                <a href="/login" style={{ textDecoration: 'none' }}>
                  <motion.button className="btn-secondary" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                    Log in to save
                  </motion.button>
                </a>
              )}
            </>
          ) : (
            <>
              <motion.button className="btn-primary" onClick={startReview} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                🔄 Review Again
              </motion.button>
              <motion.button className="btn-secondary" onClick={() => { setStarted(false); setCompleted(false) }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                ← Back to Setup
              </motion.button>
            </>
          )}
        </div>
      </motion.div>
    )
  }

  // Review screen
  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>

      {/* Progress */}
      <div style={{ width: '100%', maxWidth: 480, marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
            Card {currentIndex + 1} of {cards.length}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {Math.round(((currentIndex) / cards.length) * 100)}% complete
          </span>
        </div>
        <div className="progress-bar">
          <motion.div
            className="progress-fill"
            style={{ background: 'var(--gradient-main)' }}
            animate={{ width: `${((currentIndex) / cards.length) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
      </div>

      {/* Swipe hints */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: 480,
        marginBottom: 16, padding: '0 8px',
      }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--accent-red)', fontWeight: 600 }}>← Not Familiar</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--accent-amber)', fontWeight: 600 }}>↑ Neutral</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--accent-green)', fontWeight: 600 }}>Familiar →</span>
      </div>

      {/* Flashcard with AnimatePresence */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
        <motion.button
          type="button"
          className="btn-secondary"
          onClick={goPrev}
          disabled={currentIndex === 0 || editing || swiping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ padding: '12px 14px', opacity: (currentIndex === 0 || editing || swiping) ? 0.4 : 1 }}
        >
          ◀ Back
        </motion.button>
      <div className="flashcard-container" style={{ position: 'relative' }}>
        <AnimatePresence mode="wait">
          {showCard && card && (
            <motion.div
              key={currentIndex}
              className="flashcard"
              style={{ cursor: swiping ? 'default' : 'grab' }}
              initial={{ scale: 0.8, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, x: 0, y: 0, rotate: 0 }}
              exit={{
                x: exitDirection.x,
                y: exitDirection.y,
                opacity: 0,
                scale: 0.7,
                rotate: exitDirection.x > 0 ? 15 : exitDirection.x < 0 ? -15 : 0,
                transition: { duration: 0.35, ease: 'easeIn' },
              }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              drag={!swiping}
              dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
              dragElastic={0.9}
              onDrag={(_, info) => {
                // Update visual cues during drag by using CSS custom properties
                const el = _.target?.closest?.('.flashcard')
                if (!el) return
                const dx = info.offset.x
                const dy = info.offset.y
                if (dx < -50) el.setAttribute('data-dir', 'left')
                else if (dx > 50) el.setAttribute('data-dir', 'right')
                else if (dy < -50) el.setAttribute('data-dir', 'up')
                else el.setAttribute('data-dir', '')
              }}
              onDragEnd={(_, info) => {
                if (swipingRef.current) return
                const threshold = 100
                const { offset } = info

                if (offset.x < -threshold) {
                  handleSwipe('unfamiliar', -600, 0)
                } else if (offset.x > threshold) {
                  handleSwipe('familiar', 600, 0)
                } else if (offset.y < -threshold) {
                  handleSwipe('neutral', 0, -600)
                }
                // else: card snaps back via animate
              }}
              onClick={() => { if (!swiping) setIsFlipped(!isFlipped) }}
              whileTap={swiping ? {} : { cursor: 'grabbing' }}
            >
              {card.set_name && (
                <div style={{
                  position: 'absolute', top: 14, left: 16, zIndex: 10,
                  fontSize: '0.7rem', fontWeight: 700, padding: '3px 10px',
                  borderRadius: 20, background: 'rgba(139, 92, 246, 0.2)',
                  border: '1px solid rgba(139, 92, 246, 0.35)',
                  color: 'var(--accent-purple)',
                  letterSpacing: '0.5px',
                }}>
                  📚 {card.set_name}
                </div>
              )}
              <motion.div
                style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  transformStyle: 'preserve-3d',
                }}
                animate={{ rotateY: isFlipped ? 180 : 0 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 200, damping: 25 }}
              >
                {/* Front */}
                <div className="flashcard-face">
                  <div className="flashcard-label">{frontLabel}</div>
                  <div className="flashcard-text">{getFront(card)}</div>
                </div>
                {/* Back */}
                <div className="flashcard-face flashcard-back">
                  <div className="flashcard-label">{backLabel}</div>
                  <div className="flashcard-text">{getBack(card)}</div>
                </div>
              </motion.div>

              {/* Swipe direction overlays — shown via drag offset */}
              <SwipeOverlay direction="left" />
              <SwipeOverlay direction="right" />
              <SwipeOverlay direction="up" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
        <motion.button
          type="button"
          className="btn-secondary"
          onClick={goNext}
          disabled={currentIndex >= cards.length - 1 || editing || swiping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ padding: '12px 14px', opacity: (currentIndex >= cards.length - 1 || editing || swiping) ? 0.4 : 1 }}
        >
          Skip ▶
        </motion.button>
      </div>

      {/* Action buttons as fallback */}
      <div style={{ display: 'flex', gap: 12, marginTop: 32 }}>
        <motion.button
          className="btn-secondary"
          onClick={() => handleButtonSwipe('unfamiliar')}
          disabled={swiping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ borderColor: 'rgba(239, 68, 68, 0.3)', color: 'var(--accent-red)', opacity: swiping ? 0.5 : 1 }}
        >
          ❌ Not Familiar
        </motion.button>
        <motion.button
          className="btn-secondary"
          onClick={() => handleButtonSwipe('neutral')}
          disabled={swiping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ borderColor: 'rgba(245, 158, 11, 0.3)', color: 'var(--accent-amber)', opacity: swiping ? 0.5 : 1 }}
        >
          ➖ Neutral
        </motion.button>
        <motion.button
          className="btn-secondary"
          onClick={() => handleButtonSwipe('familiar')}
          disabled={swiping}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{ borderColor: 'rgba(16, 185, 129, 0.3)', color: 'var(--accent-green)', opacity: swiping ? 0.5 : 1 }}
        >
          ✅ Familiar
        </motion.button>
      </div>

      {/* Tap to flip hint */}
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 20 }}>
        Tap card to flip · Drag to rate · Use buttons on desktop
      </p>
    </motion.div>
  )
}

function SwipeOverlay({ direction }) {
  const config = {
    left: {
      bg: 'rgba(239, 68, 68, 0.25)',
      border: '3px solid var(--accent-red)',
      color: 'var(--accent-red)',
      label: 'Not Familiar',
    },
    right: {
      bg: 'rgba(16, 185, 129, 0.25)',
      border: '3px solid var(--accent-green)',
      color: 'var(--accent-green)',
      label: 'Familiar',
    },
    up: {
      bg: 'rgba(245, 158, 11, 0.25)',
      border: '3px solid var(--accent-amber)',
      color: 'var(--accent-amber)',
      label: 'Neutral',
    },
  }[direction]

  return (
    <div
      className={`swipe-overlay swipe-overlay-${direction}`}
      style={{
        background: config.bg,
        border: config.border,
      }}
    >
      <span style={{ color: config.color }}>{config.label}</span>
    </div>
  )
}
