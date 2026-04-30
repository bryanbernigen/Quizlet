import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

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

// ── SetFilter mock ─────────────────────────────────────────────────────────
vi.mock('../components/SetFilter', () => ({
  __esModule: true,
  default: ({ search, onSearchChange, sortBy, onSortChange }) => (
    <div data-testid="set-filter">
      <input
        data-testid="search-input"
        placeholder="🔍 Search sets..."
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />
      <button data-testid="sort-btn" onClick={() => onSortChange('updated_desc')}>
        Sort
      </button>
    </div>
  ),
  useSetFilter: (sets) => ({
    search: '',
    setSearch: vi.fn(),
    sortBy: 'updated_desc',
    setSortBy: vi.fn(),
    filteredSets: sets,
  }),
}))

// ── useApiFetch mock ──────────────────────────────────────────────────────
const mockApiFetch = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useApiFetch: () => mockApiFetch,
}))

// ── window.confirm stub ───────────────────────────────────────────────────
const realConfirm = window.confirm
const confirmStub = vi.fn(() => true)
window.confirm = confirmStub
afterEach(() => confirmStub.mockClear())
afterAll(() => { window.confirm = realConfirm })

// ── Test data ──────────────────────────────────────────────────────────────
const mockSets = [
  {
    id: 1, name: 'Korean Greetings', card_count: 5,
    familiar_count: 2, neutral_count: 1, unfamiliar_count: 2,
    is_shared: false, share_token: null, copied_count: 0,
    created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
  },
  {
    id: 2, name: 'Basic Verbs', card_count: 3,
    familiar_count: 1, neutral_count: 1, unfamiliar_count: 1,
    is_shared: true, share_token: 'abc123', copied_count: 2,
    created_at: '2024-01-02T00:00:00Z', updated_at: '2024-01-03T00:00:00Z',
  },
  {
    id: 3, name: 'Numbers', card_count: 0,
    familiar_count: 0, neutral_count: 0, unfamiliar_count: 0,
    is_shared: false, share_token: null, copied_count: 0,
    created_at: '2024-01-04T00:00:00Z', updated_at: '2024-01-04T00:00:00Z',
  },
]

const mockCards = [
  { id: 10, front: '안녕하세요', back: 'Halo' },
  { id: 11, front: '감사합니다', back: 'Terima kasih' },
  { id: 12, front: '사랑해', back: 'Aku cinta kamu' },
]

const manySets = Array.from({ length: 15 }, (_, i) => ({
  id: i + 1, name: `Set ${i + 1}`, card_count: 1,
  familiar_count: 0, neutral_count: 0, unfamiliar_count: 1,
  is_shared: false, share_token: null, copied_count: 0,
  created_at: '2024-01-01T00:00:00Z', updated_at: '2024-01-01T00:00:00Z',
}))

// ── Component import (after mocks) ─────────────────────────────────────────
import ManageSets from '../pages/ManageSets'

const TestWrapper = ({ children, initialEntries = ['/'] }) => (
  <MemoryRouter initialEntries={initialEntries}>
    {children}
  </MemoryRouter>
)

describe('ManageSets', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockImplementation((url, options = {}) => {
      if (url === '/api/sets') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
      }
      if (url === '/api/sets/1/cards') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCards) })
      }
      if (url === '/api/sets/2/cards') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([mockCards[0]]) })
      }
      if (url === '/api/sets/3/cards') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      if (url === '/api/sets/1' && options.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url === '/api/sets/2' && options.method === 'DELETE') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
      }
      if (url === '/api/sets/1/share' && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shareToken: 'newtoken' }),
        })
      }
      if (url === '/api/sets/2/share' && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ shareToken: null }),
        })
      }
      if (options.method === 'POST') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 99 }) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })
  })

  // ── Loading, empty, error states ──────────────────────────────────────────

  it('loads and displays sets on mount', async () => {
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('Korean Greetings')).toBeInTheDocument()
    })
    expect(screen.getByText('Basic Verbs')).toBeInTheDocument()
    expect(screen.getByText('Numbers')).toBeInTheDocument()
  })

  it('shows empty state when no sets', async () => {
    mockApiFetch.mockImplementation((url) => {
      if (url === '/api/sets') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('No sets yet')).toBeInTheDocument()
    })
    expect(screen.getByText('+ Create Your First Set')).toBeInTheDocument()
  })

  it('shows error state on API failure', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'))
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => {
      expect(screen.getByText('Failed to load sets.')).toBeInTheDocument()
    })
  })

  // ── CreateSetForm ──────────────────────────────────────────────────────────
  // Note: the inline form in ManageSets is wrapped in AnimatePresence + motion.div
  // with overflow:hidden. We test the form submission by verifying the POST call.

  it('CreateSetForm calls POST /api/sets when save is clicked', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    // Open the create form
    await user.click(screen.getByRole('button', { name: '+ New Set' }))

    // Wait for form to appear
    await waitFor(() => {
      expect(screen.getByPlaceholderText('e.g., Korean Greetings, Basic Verbs...')).toBeInTheDocument()
    })

    const nameInput = screen.getByPlaceholderText('e.g., Korean Greetings, Basic Verbs...')
    await user.type(nameInput, 'New Set Name')

    // Use fireEvent for textarea (inside animated container)
    const textarea = document.querySelector('textarea')
    fireEvent.change(textarea, { target: { value: '안녕하세요 - Halo\n감사합니다 - Terima kasih' } })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Save Set \(2 cards\)/ })).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /Save Set \(2 cards\)/ }))

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/sets',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      )
    })
  })

  // ── Detail panel ────────────────────────────────────────────────────────────

  it('clicking a set card opens detail panel', async () => {
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    // Use fireEvent on the text span inside the motion.div card
    fireEvent.click(screen.getByText('Korean Greetings'))

    await waitFor(() => {
      // Check for "Edit Set" link which appears when the panel is open
      expect(screen.getByRole('link', { name: /Edit Set/ })).toBeInTheDocument()
    })
  })

  it('Detail panel shows set name, card count, and action buttons', async () => {
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    fireEvent.click(screen.getByText('Korean Greetings'))

    await waitFor(() => {
      // The card count "5 cards" appears in both the list card and the detail panel.
      // Verify at least 2 instances (list + panel) exist, confirming the panel opened.
      expect(screen.getAllByText(/5.*card/).length).toBeGreaterThanOrEqual(2)
      expect(screen.getByRole('link', { name: /Edit Set/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Review/ })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /Take Quiz/ })).toBeInTheDocument()
    })
  })

  it('Detail panel Edit button navigates to /edit/:id', async () => {
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    fireEvent.click(screen.getByText('Korean Greetings'))
    await waitFor(() => screen.getByRole('link', { name: /Edit Set/ }))

    const editLink = screen.getByRole('link', { name: /Edit Set/ })
    expect(editLink).toHaveAttribute('href', '/edit/1')
  })

  it('Detail panel Review button navigates to /review?setIds=', async () => {
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    fireEvent.click(screen.getByText('Korean Greetings'))
    await waitFor(() => screen.getByRole('link', { name: /Review/ }))

    const reviewLink = screen.getByRole('link', { name: /Review/ })
    expect(reviewLink).toHaveAttribute('href', '/review?setIds=1')
  })

  it('Detail panel Quiz button navigates to /quiz?setIds=', async () => {
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    fireEvent.click(screen.getByText('Korean Greetings'))
    await waitFor(() => screen.getByRole('link', { name: /Take Quiz/ }))

    const quizLink = screen.getByRole('link', { name: /Take Quiz/ })
    expect(quizLink).toHaveAttribute('href', '/quiz?setIds=1')
  })

  it('Detail panel close button (X) closes panel', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    fireEvent.click(screen.getByText('Korean Greetings'))
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Edit Set/ })).toBeInTheDocument()
    })

    const closeBtn = screen.getByRole('button', { name: /✕/ })
    await user.click(closeBtn)

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Edit Set/ })).not.toBeInTheDocument()
    })
  })

  // ── Delete ─────────────────────────────────────────────────────────────────

  it('Delete button removes set from list on success', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/ })
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(screen.queryByText('Korean Greetings')).not.toBeInTheDocument()
    })
  })

  // ── Share toggle ────────────────────────────────────────────────────────────

  it('Share toggle calls POST /api/sets/:id/share', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Korean Greetings'))

    const shareButtons = screen.getAllByRole('button', { name: /Share/ })
    await user.click(shareButtons[0])

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/sets/1/share',
        expect.objectContaining({ method: 'POST' })
      )
    })
  })

  it('Share toggle shows Shared badge when already shared', async () => {
    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )
    await waitFor(() => screen.getByText('Basic Verbs'))

    const sharedBadges = screen.getAllByText('Shared')
    expect(sharedBadges.length).toBeGreaterThan(0)
  })

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('pagination next/prev buttons work', async () => {
    const user = userEvent.setup()
    mockApiFetch.mockImplementation((url) => {
      if (url === '/api/sets') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(manySets) })
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    })

    render(
      <TestWrapper>
        <ManageSets />
      </TestWrapper>
    )

    await waitFor(() => screen.getByText('Set 1'))

    expect(screen.getByText('Set 1')).toBeInTheDocument()
    expect(screen.getByText('Set 10')).toBeInTheDocument()
    expect(screen.queryByText('Set 11')).not.toBeInTheDocument()
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /← Prev/ })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: /Next/ }))

    await waitFor(() => {
      expect(screen.getByText('Page 2 of 2')).toBeInTheDocument()
      expect(screen.getByText('Set 11')).toBeInTheDocument()
      expect(screen.getByText('Set 15')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: /← Prev/ }))

    await waitFor(() => {
      expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
      expect(screen.getByText('Set 1')).toBeInTheDocument()
    })
  })
})
