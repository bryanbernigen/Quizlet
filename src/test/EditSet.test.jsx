import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// ── Framer Motion mock ──────────────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: 'div', button: 'button', span: 'span', h2: 'h2', h3: 'h3', p: 'p',
    li: 'li', ul: 'ul', form: 'form', input: 'input', td: 'td', tr: 'tr',
    th: 'th', tbody: 'tbody', thead: 'thead', table: 'table', nav: 'nav',
    section: 'section', header: 'header', footer: 'footer', main: 'main',
    article: 'article', aside: 'aside', img: 'img', label: 'label',
    textarea: 'textarea', select: 'select', option: 'option', a: 'a',
  },
  AnimatePresence: ({ children }) => children,
  useAnimation: () => ({ start: vi.fn() }),
  useInView: () => false,
}))

// ── useApiFetch mock ───────────────────────────────────────────────────────
const mockApiFetch = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useApiFetch: () => mockApiFetch,
}))

// ── Test data ───────────────────────────────────────────────────────────────
const mockExistingSet = [
  {
    id: 42, name: 'Korean Greetings', card_count: 3,
    familiar_count: 1, neutral_count: 1, unfamiliar_count: 1,
    is_shared: false, share_token: null, copied_count: 0,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
]

const mockExistingCards = [
  { id: 101, front: '안녕하세요', back: 'Halo' },
  { id: 102, front: '감사합니다', back: 'Terima kasih' },
  { id: 103, front: '사랑해', back: 'Aku cinta kamu' },
]

// ── Component import (after mocks) ─────────────────────────────────────────
import EditSet from '../pages/EditSet'

// Wrap with Routes so useParams(:id) resolves correctly
const TestWrapper = ({ children }) => (
  <MemoryRouter initialEntries={['/edit/42']}>
    <Routes>
      <Route path="/edit/:id" element={children} />
      <Route path="/" element={<div>Home</div>} />
    </Routes>
  </MemoryRouter>
)

describe('EditSet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockExistingSet),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockExistingCards),
      })
      .mockImplementation((url, options = {}) => {
        if (options.method === 'PUT') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Loading & error ─────────────────────────────────────────────────────────

  it('shows loading state initially', () => {
    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )
    expect(screen.getByText('Loading set...')).toBeInTheDocument()
  })

  it('loads existing set and cards on mount', async () => {
    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('Edit Set')).toBeInTheDocument()
    })

    const nameInput = screen.getByPlaceholderText('e.g., Korean Greetings, Basic Verbs...')
    expect(nameInput.value).toBe('Korean Greetings')

    const textarea = document.querySelector('textarea')
    expect(textarea.value).toContain('안녕하세요 - Halo')
    expect(textarea.value).toContain('감사합니다 - Terima kasih')
    expect(textarea.value).toContain('사랑해 - Aku cinta kamu')
  })

  it('displays existing cards in preview', async () => {
    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )

    await waitFor(() => screen.getByText('3 valid cards'))

    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
    expect(screen.getByText('Halo')).toBeInTheDocument()
    expect(screen.getByText('감사합니다')).toBeInTheDocument()
    expect(screen.getByText('Terima kasih')).toBeInTheDocument()
    expect(screen.getByText('사랑해')).toBeInTheDocument()
    expect(screen.getByText('Aku cinta kamu')).toBeInTheDocument()
  })

  it('shows error state when load fails', async () => {
    mockApiFetch.mockReset()
    mockApiFetch.mockRejectedValue(new Error('Load failed'))

    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )

    await waitFor(() => {
      expect(screen.getByText('Failed to load set. Please try again.')).toBeInTheDocument()
    })
  })

  // ── Bulk text parsing ───────────────────────────────────────────────────────

  it('bulk text parsing updates preview when text changes', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )

    await waitFor(() => screen.getByText('3 valid cards'))

    const textarea = document.querySelector('textarea')
    await user.clear(textarea)
    await user.type(textarea, '안녕하세요 - Halo')

    await waitFor(() => {
      expect(screen.getByText('1 valid card')).toBeInTheDocument()
    })

    await user.clear(textarea)
    await user.type(textarea, '안녕하세요 - Halo\n감사합니다 - Terima kasih\n잘가 - Selamat tinggal')

    await waitFor(() => {
      expect(screen.getByText('3 valid cards')).toBeInTheDocument()
    })
  })

  // ── Save / PUT ──────────────────────────────────────────────────────────────

  it('Update button updates set via PUT /api/sets/:id', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )

    await waitFor(() => screen.getByText('3 valid cards'))

    await user.click(screen.getByRole('button', { name: /Update Set \(3 cards\)/ }))

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/sets/42',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })
  })

  it('navigates back on cancel (calls navigate("/"))', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )

    await waitFor(() => screen.getByText('Edit Set'))

    await user.click(screen.getByRole('button', { name: /← Cancel/ }))

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
    })
  })

  // ── Preview updates ─────────────────────────────────────────────────────────

  it('modifying bulk text updates card count in preview', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <EditSet />
      </TestWrapper>
    )

    await waitFor(() => screen.getByText('3 valid cards'))

    const textarea = document.querySelector('textarea')
    await user.clear(textarea)

    await waitFor(() => {
      expect(screen.queryByText(/valid card/)).not.toBeInTheDocument()
    })
  })
})
