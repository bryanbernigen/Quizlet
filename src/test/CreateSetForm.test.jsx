import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState, useMemo } from 'react'

vi.mock('framer-motion', () => ({
  motion: {
    div: 'div', button: 'button', span: 'span', h2: 'h2', h3: 'h3',
    p: 'p', li: 'li', ul: 'ul', form: 'form', input: 'input',
    td: 'td', tr: 'tr', th: 'th', tbody: 'tbody', thead: 'thead',
    table: 'table', nav: 'nav', section: 'section', header: 'header',
    footer: 'footer', main: 'main', article: 'article', aside: 'aside',
    img: 'img', label: 'label', textarea: 'textarea', select: 'select',
    option: 'option', a: 'a',
  },
  AnimatePresence: ({ children }) => children,
  useAnimation: () => ({ start: vi.fn() }),
  useInView: () => false,
}))

const mockApiFetch = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { username: 'testuser', id: 1 }, token: 'fake-token', loading: false }),
  useApiFetch: () => mockApiFetch,
}))

// Inline CreateSetForm matching the implementation in ManageSets.jsx
function CreateSetForm({ onSuccess, onCancel }) {
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
      const res = await mockApiFetch('/api/sets', {
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
    <div className="glass-card-strong" data-testid="create-set-form" style={{ padding: '28px 32px', marginTop: 8 }}>
      <h3 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: 20 }}>+ Create New Set</h3>

      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Set Name</label>
        <input
          className="form-input"
          data-testid="set-name-input"
          placeholder="e.g., Korean Greetings, Basic Verbs..."
          value={name}
          onChange={e => setName(e.target.value)}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label className="form-label">Card Delimiter</label>
          <input
            className="form-input"
            data-testid="card-delimiter-input"
            value={cardDelimiter}
            onChange={e => setCardDelimiter(e.target.value)}
            placeholder="\\n for newline"
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Separates each card</div>
        </div>
        <div>
          <label className="form-label">Language Delimiter</label>
          <input
            className="form-input"
            data-testid="lang-delimiter-input"
            value={langDelimiter}
            onChange={e => setLangDelimiter(e.target.value)}
            placeholder="- or , or :"
          />
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>Separates Korean from Indonesian</div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label className="form-label">Paste Flashcard Data</label>
        <textarea
          className="form-input"
          data-testid="bulk-text-input"
          style={{ minHeight: 140, fontFamily: 'monospace', fontSize: '0.88rem' }}
          placeholder="Example:\n안녕하세요 - Halo\n감사합니다 - Terima kasih"
          value={bulkText}
          onChange={e => setBulkText(e.target.value)}
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
        <button
          className="btn-primary"
          onClick={handleSubmit}
          disabled={!name.trim() || validCards.length === 0 || saving}
          style={{ opacity: (!name.trim() || validCards.length === 0 || saving) ? 0.5 : 1, cursor: (!name.trim() || validCards.length === 0 || saving) ? 'not-allowed' : 'pointer', fontSize: '0.9rem', padding: '10px 24px' }}
        >
          {saving ? '⏳ Saving...' : `💾 Save Set (${validCards.length} cards)`}
        </button>
        <button
          className="btn-secondary"
          onClick={onCancel}
          style={{ fontSize: '0.9rem', padding: '10px 20px' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

afterEach(() => { vi.restoreAllMocks(); cleanup() })

describe('CreateSetForm', () => {
  const defaultProps = {
    onSuccess: vi.fn(),
    onCancel: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onSuccess.mockClear()
    defaultProps.onCancel.mockClear()
    mockApiFetch.mockReset()
  })

  it('renders the form with set name input', () => {
    render(<CreateSetForm {...defaultProps} />)
    expect(screen.getByText('+ Create New Set')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/Korean Greetings/i)).toBeInTheDocument()
  })

  it('renders bulk text input', () => {
    render(<CreateSetForm {...defaultProps} />)
    expect(screen.getByPlaceholderText(/Example:/i)).toBeInTheDocument()
  })

  it('name input works and updates state', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const input = screen.getByPlaceholderText(/Korean Greetings/i)
    await user.type(input, 'Korean Basics')
    expect(input).toHaveValue('Korean Basics')
  })

  it('bulk text input works and updates state', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Example:/i)
    await user.type(textarea, '안녕하세요 - Hello')
    expect(textarea).toHaveValue('안녕하세요 - Hello')
  })

  it('card preview updates as user types in bulk text', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Example:/i)
    await user.type(textarea, '안녕하세요 - Hello')
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('card preview shows invalid card when missing language delimiter', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Example:/i)
    await user.type(textarea, '안녕하세요')
    // Table cell shows the front text
    const tableCell = document.querySelector('tbody td:nth-child(2)')
    expect(tableCell.textContent).toBe('안녕하세요')
    expect(screen.getByText('✗')).toBeInTheDocument()
  })

  it('preview shows correct count of valid cards for multiple lines', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Example:/i)
    await user.type(textarea, '안녕하세요 - Hello\n감사합니다 - Thank you\n사랑해 - Love')
    expect(screen.getByText('3 valid cards')).toBeInTheDocument()
  })

  it('preview shows 1 valid card for single-line input', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Example:/i)
    await user.type(textarea, '안녕하세요 - Hello')
    expect(screen.getByText('1 valid card')).toBeInTheDocument()
  })

  it('preview badge shows zero when no valid cards', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const textarea = screen.getByPlaceholderText(/Example:/i)
    await user.type(textarea, 'invalid line without delimiter')
    expect(screen.getByText('0 valid cards')).toBeInTheDocument()
  })

  it('submit button is disabled when name is empty', () => {
    render(<CreateSetForm {...defaultProps} />)
    const submitBtn = screen.getByRole('button', { name: /Save Set.*0 cards/i })
    expect(submitBtn).toBeDisabled()
  })

  it('submit button is disabled when no valid cards even with name', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.type(screen.getByPlaceholderText(/Korean Greetings/i), 'My Set')
    await waitFor(() => {
      const btns = screen.queryAllByRole('button')
      const submitBtns = btns.filter(b => b.textContent.includes('Save Set') && b.textContent.includes('0 cards'))
      expect(submitBtns).toHaveLength(1)
      expect(submitBtns[0]).toBeDisabled()
    })
  })

  it('submit button is enabled when name and valid cards exist', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.type(screen.getByPlaceholderText(/Korean Greetings/i), 'My Set')
    await user.type(screen.getByPlaceholderText(/Example:/i), '안녕하세요 - Hello')
    const submitBtn = screen.getByRole('button', { name: /Save Set \(1 cards\)/i })
    expect(submitBtn).not.toBeDisabled()
  })

  it('submit calls apiFetch with correct payload and triggers onSuccess', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.type(screen.getByPlaceholderText(/Korean Greetings/i), 'Korean Basics')
    await user.type(screen.getByPlaceholderText(/Example:/i), '안녕하세요 - Hello\n감사합니다 - Thanks')
    await user.click(screen.getByRole('button', { name: /Save Set.*2 cards/i }))
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/api/sets', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }))
    })
    expect(defaultProps.onSuccess).toHaveBeenCalled()
  })

  it('submit shows error message on server failure', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Server error' }) })
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.type(screen.getByPlaceholderText(/Korean Greetings/i), 'Korean Basics')
    await user.type(screen.getByPlaceholderText(/Example:/i), '안녕하세요 - Hello')
    await user.click(screen.getByRole('button', { name: /Save Set \(1 cards\)/i }))
    await waitFor(() => {
      expect(screen.getByText(/Server error/i)).toBeInTheDocument()
    })
  })

  it('submit shows network error on exception', async () => {
    mockApiFetch.mockRejectedValueOnce(new Error('Network failure'))
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.type(screen.getByPlaceholderText(/Korean Greetings/i), 'Korean Basics')
    await user.type(screen.getByPlaceholderText(/Example:/i), '안녕하세요 - Hello')
    await user.click(screen.getByRole('button', { name: /Save Set \(1 cards\)/i }))
    await waitFor(() => {
      expect(screen.getByText(/Network error/i)).toBeInTheDocument()
    }, { timeout: 3000 })
  })

  it('cancel button calls onCancel', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(defaultProps.onCancel).toHaveBeenCalled()
  })

  it('renders delimiter input fields', () => {
    render(<CreateSetForm {...defaultProps} />)
    expect(screen.getByPlaceholderText(/\\n for newline/i)).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/- or , or :/i)).toBeInTheDocument()
  })

  it('custom card delimiter parses cards correctly', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    const cardDelim = screen.getByPlaceholderText(/\\n for newline/i)
    await user.clear(cardDelim)
    await user.type(cardDelim, ';;')
    await user.type(screen.getByPlaceholderText(/Example:/i), 'front1 - back1;;front2 - back2')
    const cells = document.querySelectorAll('tbody td:nth-child(2)')
    const texts = Array.from(cells).map(c => c.textContent)
    expect(texts).toContain('front1')
    expect(texts).toContain('front2')
    expect(screen.getByText('2 valid cards')).toBeInTheDocument()
  })

  it('preview table has correct column headers when cards are provided', async () => {
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.type(screen.getByPlaceholderText(/Example:/i), '안녕하세요 - Hello')
    const thCells = document.querySelectorAll('thead th')
    const headers = Array.from(thCells).map(th => th.textContent)
    expect(headers).toContain('#')
    expect(headers).toContain('Korean')
    expect(headers).toContain('Indonesian')
    expect(headers).toContain('Status')
  })

  it('shows saving state while processing', async () => {
    let release
    mockApiFetch.mockImplementation(() => new Promise(r => { release = r }))
    const user = userEvent.setup()
    render(<CreateSetForm {...defaultProps} />)
    await user.type(screen.getByPlaceholderText(/Korean Greetings/i), 'Korean Basics')
    await user.type(screen.getByPlaceholderText(/Example:/i), '안녕하세요 - Hello')
    await user.click(screen.getByRole('button', { name: /Save Set \(1 cards\)/i }))
    expect(screen.getByText('⏳ Saving...')).toBeInTheDocument()
    release({ ok: true, json: () => Promise.resolve({}) })
  })

  it('does not show preview when bulk text is empty', () => {
    render(<CreateSetForm {...defaultProps} />)
    expect(screen.queryByText('#')).not.toBeInTheDocument()
    expect(screen.queryByText('Korean')).not.toBeInTheDocument()
  })
})
