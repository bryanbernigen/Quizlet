import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import SetFilter, { useSetFilter } from '../components/SetFilter'
import CardFilters, { useCardFilters } from '../components/CardFilters'
import { useApiFetch } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function SpellingQuiz() {
  const [sets, setSets] = useState([])
  const [selectedSets, setSelectedSets] = useState([])
  const [questionCount, setQuestionCount] = useState(10)
  const [cards, setCards] = useState([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState(null) // { correct, correctAnswer }
  const [started, setStarted] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [score, setScore] = useState({ correct: 0, incorrect: 0 })
  const [history, setHistory] = useState([]) // { question, answer, userAnswer, correct }
  const inputRef = useRef(null)
  const [frontLang, setFrontLang] = useState('korean') // 'korean' or 'indonesian'
  const { familiarityFilter, attemptFilter, toggleFamiliarity, toggleAttempt, buildQueryParams } = useCardFilters()
  const apiFetch = useApiFetch()

  const getQuestion = (c) => frontLang === 'korean' ? c.front : c.back
  const getAnswer = (c) => frontLang === 'korean' ? c.back : c.front
  const questionLabel = frontLang === 'korean' ? 'Korean' : 'Indonesian'
  const answerLabel = frontLang === 'korean' ? 'Indonesian' : 'Korean'

  useEffect(() => {
    apiFetch('/api/sets').then(r => r.json()).then(setSets)
  }, [])

  const { search, setSearch, sortBy, setSortBy, filteredSets } = useSetFilter(sets)

  const toggleSet = (id) => {
    setSelectedSets(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    )
  }

  const startQuiz = async () => {
    if (selectedSets.length === 0) return
    const filterParams = buildQueryParams()
    const url = `/api/cards/quiz?setIds=${selectedSets.join(',')}&count=${questionCount}${filterParams ? '&' + filterParams : ''}`
    const res = await apiFetch(url)
    const data = await res.json()
    if (data.length === 0) return
    setCards(data)
    setCurrentIndex(0)
    setAnswer('')
    setFeedback(null)
    setStarted(true)
    setCompleted(false)
    setScore({ correct: 0, incorrect: 0 })
    setHistory([])
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  const checkAnswer = async () => {
    if (feedback) return // already checked
    const card = cards[currentIndex]
    const correctAnswer = getAnswer(card)
    const isCorrect = answer.trim().toLowerCase() === correctAnswer.trim().toLowerCase()

    await apiFetch(`/api/cards/${card.id}/quiz-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isCorrect }),
    })

    setFeedback({ correct: isCorrect, correctAnswer })
    setScore(prev => ({
      ...prev,
      [isCorrect ? 'correct' : 'incorrect']: prev[isCorrect ? 'correct' : 'incorrect'] + 1,
    }))
    setHistory(prev => [...prev, {
      question: getQuestion(card),
      answer: correctAnswer,
      userAnswer: answer.trim(),
      correct: isCorrect,
    }])
  }

  const nextQuestion = () => {
    if (currentIndex + 1 >= cards.length) {
      setCompleted(true)
    } else {
      setCurrentIndex(prev => prev + 1)
      setAnswer('')
      setFeedback(null)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      if (feedback) {
        nextQuestion()
      } else if (answer.trim()) {
        checkAnswer()
      }
    }
  }

  const card = cards[currentIndex]
  const totalAnswered = score.correct + score.incorrect

  // Setup screen
  if (!started) {
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
          <span className="gradient-text">Spelling Quiz</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Test your Korean-Indonesian vocabulary</p>

        <div style={{ marginBottom: 24 }}>
          <label className="form-label">Select Sets</label>
          {sets.length === 0 ? (
            <p style={{ color: 'var(--text-secondary)' }}>No sets found. Create one first!</p>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}>
                <SetFilter
                  search={search} onSearchChange={setSearch}
                  sortBy={sortBy} onSortChange={setSortBy}
                  totalCount={sets.length} filteredCount={filteredSets.length}
                />
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
                          <span style={{ color: 'var(--accent-green)' }}>● {s.familiar_count}</span>
                          <span style={{ color: 'var(--accent-amber)' }}>● {s.neutral_count}</span>
                          <span style={{ color: 'var(--accent-red)' }}>● {s.unfamiliar_count}</span>
                          <span>Result: </span>
                          <span style={{ color: 'var(--accent-green)' }}>● {s.correct_count} Correct</span>
                          <span style={{ color: 'var(--accent-red)' }}>● {s.incorrect_count} Incorrect</span>
                          <span style={{ color: 'var(--accent-amber)' }}>● {s.unattempted_count} Unattempted</span>
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Card Filters */}
        <CardFilters
          familiarityFilter={familiarityFilter}
          attemptFilter={attemptFilter}
          onToggleFamiliarity={toggleFamiliarity}
          onToggleAttempt={toggleAttempt}
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 32, maxWidth: 420 }}>
          <div>
            <label className="form-label">Number of Questions</label>
            <input
              type="number"
              className="form-input"
              value={questionCount}
              onChange={e => setQuestionCount(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
            />
          </div>
          <div>
            <label className="form-label">Show First</label>
            <div style={{ display: 'flex', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border-glass)' }}>
              <button
                onClick={() => setFrontLang('korean')}
                style={{
                  flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                  background: frontLang === 'korean' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
                  color: frontLang === 'korean' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                🇰🇷 Korean
              </button>
              <button
                onClick={() => setFrontLang('indonesian')}
                style={{
                  flex: 1, padding: '12px 8px', border: 'none', cursor: 'pointer',
                  borderLeft: '1px solid var(--border-glass)',
                  background: frontLang === 'indonesian' ? 'rgba(139, 92, 246, 0.25)' : 'transparent',
                  color: frontLang === 'indonesian' ? 'var(--accent-purple)' : 'var(--text-secondary)',
                  fontWeight: 600, fontSize: '0.85rem', fontFamily: 'inherit',
                  transition: 'all 0.2s',
                }}
              >
                🇮🇩 Indonesian
              </button>
            </div>
          </div>
        </div>

        <motion.button
          className="btn-primary"
          onClick={startQuiz}
          disabled={selectedSets.length === 0}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            opacity: selectedSets.length === 0 ? 0.5 : 1,
            fontSize: '1rem',
            padding: '14px 36px',
          }}
        >
          ✏️ Start Quiz
        </motion.button>
      </motion.div>
    )
  }

  // Completed screen
  if (completed) {
    const pct = totalAnswered > 0 ? Math.round((score.correct / totalAnswered) * 100) : 0
    return (
      <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit"
        style={{ textAlign: 'center', paddingTop: 40 }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          style={{ fontSize: '4rem', marginBottom: 16 }}
        >
          {pct >= 80 ? '🏆' : pct >= 50 ? '👍' : '💪'}
        </motion.div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
          <span className="gradient-text">Quiz Complete!</span>
        </h1>
        <p style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 32 }}>
          Score: {pct}%
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 350, margin: '0 auto 40px' }}>
          <div className="glass-card stat-card">
            <div className="stat-value" style={{ color: 'var(--accent-green)' }}>{score.correct}</div>
            <div className="stat-label">Correct</div>
          </div>
          <div className="glass-card stat-card">
            <div className="stat-value" style={{ color: 'var(--accent-red)' }}>{score.incorrect}</div>
            <div className="stat-label">Incorrect</div>
          </div>
        </div>

        {/* Results detail */}
        {history.length > 0 && (
          <div style={{ maxWidth: 600, margin: '0 auto 40px', textAlign: 'left' }}>
            <h3 style={{ fontWeight: 700, marginBottom: 16, fontSize: '1.1rem' }}>📝 Answer Details</h3>
            <div className="glass-card" style={{ overflow: 'hidden' }}>
              <table className="preview-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Correct Answer</th>
                    <th>Your Answer</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{h.question}</td>
                      <td style={{ color: 'var(--accent-green)' }}>{h.answer}</td>
                      <td style={{ color: h.correct ? 'var(--text-primary)' : 'var(--accent-red)' }}>{h.userAnswer || '—'}</td>
                      <td>{h.correct ? '✅' : '❌'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <motion.button className="btn-primary" onClick={startQuiz} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            🔄 Retry Quiz
          </motion.button>
          <motion.button className="btn-secondary" onClick={() => { setStarted(false); setCompleted(false) }} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            ← Back to Setup
          </motion.button>
        </div>
      </motion.div>
    )
  }

  // Quiz screen
  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 40 }}>

      {/* Progress */}
      <div style={{ width: '100%', maxWidth: 520, marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
            Question {currentIndex + 1} of {cards.length}
          </span>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
            <span style={{ color: 'var(--accent-green)' }}>{score.correct}</span>
            {' / '}
            <span style={{ color: 'var(--accent-red)' }}>{score.incorrect}</span>
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

      {/* Question card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentIndex}
          className="glass-card-strong"
          style={{
            width: '100%',
            maxWidth: 520,
            padding: '48px 40px',
            textAlign: 'center',
          }}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div style={{
            fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '1.5px',
            color: 'var(--text-secondary)', marginBottom: 16, fontWeight: 600,
          }}>
            Translate to {answerLabel}
          </div>
          <div style={{
            fontSize: '2.2rem', fontWeight: 700, marginBottom: 36,
            lineHeight: 1.3,
          }}>
            {getQuestion(card)}
          </div>

          <input
            ref={inputRef}
            className="form-input quiz-input"
            placeholder={`Type the ${answerLabel} translation...`}
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={!!feedback}
            autoComplete="off"
            autoFocus
            style={feedback ? {
              borderColor: feedback.correct ? 'var(--accent-green)' : 'var(--accent-red)',
              background: feedback.correct ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
            } : {}}
          />

          {/* Feedback */}
          <AnimatePresence>
            {feedback && (
              <motion.div
                className={`quiz-feedback ${feedback.correct ? 'correct' : 'incorrect'}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {feedback.correct ? (
                  '✅ Correct!'
                ) : (
                  <>❌ Incorrect — the answer is: <strong>{feedback.correctAnswer}</strong></>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      {/* Action button */}
      <div style={{ marginTop: 28 }}>
        {!feedback ? (
          <motion.button
            className="btn-primary"
            onClick={checkAnswer}
            disabled={!answer.trim()}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{
              opacity: !answer.trim() ? 0.5 : 1,
              fontSize: '1rem', padding: '14px 36px',
            }}
          >
            ✓ Check Answer
          </motion.button>
        ) : (
          <motion.button
            className="btn-primary"
            onClick={nextQuestion}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            style={{ fontSize: '1rem', padding: '14px 36px' }}
          >
            {currentIndex + 1 >= cards.length ? '🏁 See Results' : '→ Next Question'}
          </motion.button>
        )}
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 16 }}>
        Press Enter to submit / continue
      </p>
    </motion.div>
  )
}
