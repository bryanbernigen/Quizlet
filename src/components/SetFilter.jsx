import { useState, useMemo, useRef, useEffect } from 'react'

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '🕐 Last Updated' },
  { value: 'created_desc', label: '📅 Newest First' },
  { value: 'created_asc', label: '📅 Oldest First' },
  { value: 'name_asc', label: '🔤 Name A→Z' },
  { value: 'name_desc', label: '🔤 Name Z→A' },
]

export function useSetFilter(sets) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('updated_desc')

  const filteredSets = useMemo(() => {
    let result = [...sets]

    // Search
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(s => s.name.toLowerCase().includes(q))
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name_asc':
          return a.name.localeCompare(b.name)
        case 'name_desc':
          return b.name.localeCompare(a.name)
        case 'created_asc':
          return (a.created_at || '').localeCompare(b.created_at || '')
        case 'created_desc':
          return (b.created_at || '').localeCompare(a.created_at || '')
        case 'updated_desc':
        default:
          return (b.updated_at || b.created_at || '').localeCompare(a.updated_at || a.created_at || '')
      }
    })

    return result
  }, [sets, search, sortBy])

  return { search, setSearch, sortBy, setSortBy, filteredSets }
}

export default function SetFilter({ search, onSearchChange, sortBy, onSortChange, totalCount, filteredCount }) {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: 320 }}>
        <input
          className="form-input"
          placeholder="🔍 Search sets..."
          value={search}
          onChange={e => onSearchChange(e.target.value)}
          style={{ paddingRight: 36, fontSize: '0.9rem' }}
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-secondary)', fontSize: '0.9rem', fontFamily: 'inherit',
            }}
          >
            ✕
          </button>
        )}
      </div>

      <CustomDropdown
        value={sortBy}
        onChange={onSortChange}
        options={SORT_OPTIONS}
      />

      {search && totalCount !== filteredCount && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {filteredCount} of {totalCount}
        </span>
      )}
    </div>
  )
}

function CustomDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const selected = options.find(o => o.value === value)

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="form-input"
        style={{
          width: 'auto', minWidth: 170, padding: '10px 36px 10px 14px',
          fontSize: '0.85rem', cursor: 'pointer',
          background: 'rgba(255,255,255,0.05)',
          appearance: 'none',
          textAlign: 'left',
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'right 12px center',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {selected?.label || 'Select...'}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 200,
          background: 'rgba(17, 24, 39, 0.98)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 10, overflow: 'hidden',
          backdropFilter: 'blur(16px)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        }}>
          {options.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onChange(o.value); setOpen(false) }}
              style={{
                display: 'block', width: '100%', padding: '10px 14px',
                background: o.value === value ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                color: o.value === value ? 'var(--accent-purple)' : 'var(--text-primary)',
                border: 'none', cursor: 'pointer',
                fontSize: '0.85rem', fontFamily: 'inherit', fontWeight: 500,
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
              onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = 'transparent' }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
