import { useState, useMemo } from 'react'

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

      <select
        value={sortBy}
        onChange={e => onSortChange(e.target.value)}
        className="form-input"
        style={{
          width: 'auto', minWidth: 170, padding: '10px 14px',
          fontSize: '0.85rem', cursor: 'pointer',
        }}
      >
        {SORT_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      {search && totalCount !== filteredCount && (
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {filteredCount} of {totalCount}
        </span>
      )}
    </div>
  )
}
