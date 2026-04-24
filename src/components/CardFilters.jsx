import { useState } from 'react'

const FAMILIARITY_OPTS = [
  { value: 'familiar', label: 'Familiar', color: 'var(--accent-green)', emoji: '✅' },
  { value: 'neutral', label: 'Neutral', color: 'var(--accent-amber)', emoji: '➖' },
  { value: 'unfamiliar', label: 'Unfamiliar', color: 'var(--accent-red)', emoji: '❌' },
]

const ATTEMPT_OPTS = [
  { value: 'correct', label: 'Correct', color: 'var(--accent-green)', emoji: '✓' },
  { value: 'wrong', label: 'Wrong', color: 'var(--accent-red)', emoji: '✗' },
  { value: 'unattempted', label: 'Unattempted', color: 'var(--accent-amber)', emoji: '○' },
]

export function useCardFilters() {
  const [familiarityFilter, setFamiliarityFilter] = useState(['familiar', 'neutral', 'unfamiliar'])
  const [attemptFilter, setAttemptFilter] = useState(['correct', 'wrong', 'unattempted'])

  const toggleFamiliarity = (val) => {
    setFamiliarityFilter(prev => {
      if (prev.includes(val)) {
        if (prev.length === 1) return prev // don't allow empty
        return prev.filter(v => v !== val)
      }
      return [...prev, val]
    })
  }

  const toggleAttempt = (val) => {
    setAttemptFilter(prev => {
      if (prev.includes(val)) {
        if (prev.length === 1) return prev
        return prev.filter(v => v !== val)
      }
      return [...prev, val]
    })
  }

  const buildQueryParams = () => {
    const params = new URLSearchParams()
    if (familiarityFilter.length < 3) {
      params.set('familiarity', familiarityFilter.join(','))
    }
    if (attemptFilter.length < 3) {
      params.set('attempt', attemptFilter.join(','))
    }
    return params.toString()
  }

  return { familiarityFilter, attemptFilter, toggleFamiliarity, toggleAttempt, buildQueryParams }
}

function ToggleChip({ active, color, emoji, label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 12px',
        borderRadius: 8,
        border: `1px solid ${active ? color : 'var(--border-glass)'}`,
        background: active ? `${color}18` : 'transparent',
        color: active ? color : 'var(--text-secondary)',
        fontSize: '0.78rem',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 0.2s',
        opacity: active ? 1 : 0.5,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      <span>{emoji}</span> {label}
    </button>
  )
}

export default function CardFilters({ familiarityFilter, attemptFilter, onToggleFamiliarity, onToggleAttempt }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
      <div>
        <label className="form-label" style={{ fontSize: '0.8rem' }}>Familiarity</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {FAMILIARITY_OPTS.map(o => (
            <ToggleChip
              key={o.value}
              active={familiarityFilter.includes(o.value)}
              color={o.color}
              emoji={o.emoji}
              label={o.label}
              onClick={() => onToggleFamiliarity(o.value)}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="form-label" style={{ fontSize: '0.8rem' }}>Attempt Status</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {ATTEMPT_OPTS.map(o => (
            <ToggleChip
              key={o.value}
              active={attemptFilter.includes(o.value)}
              color={o.color}
              emoji={o.emoji}
              label={o.label}
              onClick={() => onToggleAttempt(o.value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
