import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
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

// ── useApiFetch mock ────────────────────────────────────────────────────────
const mockApiFetch = vi.fn()
vi.mock('../context/AuthContext', () => ({
  useApiFetch: () => mockApiFetch,
}))

// ── Component import (after mocks) ─────────────────────────────────────────
import CreateSet from '../pages/CreateSet'

const TestWrapper = ({ children }) => (
  <MemoryRouter initialEntries={['/create']}>
    <Routes>
      <Route path="/create" element={children} />
      <Route path="/" element={<div>Home</div>} />
    </Routes>
  </MemoryRouter>
)

describe('CreateSet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 99 }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── Bulk text parsing ───────────────────────────────────────────────────────

  it('parses bulk text with newlines (front\\nback format)', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <CreateSet />
      </TestWrapper>
    )

    const textarea = document.querySelector('textarea')
    await user.clear(textarea)
    await user.type(textarea, '안녕하세요 - Halo\n감사합니다 - Terima kasih')

    await waitFor(() => {
      expect(screen.getByText('2 valid cards')).toBeInTheDocument()
    })
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
    expect(screen.getByText('Halo')).toBeInTheDocument()
    expect(screen.getByText('감사합니다')).toBeInTheDocument()
    expect(screen.getByText('Terima kasih')).toBeInTheDocument()
  })

  it('parses bulk text with custom card delimiter', async () => {
    // Uses card delimiter "||" and language delimiter ":"
    // Cards: "안녕하세요:Halo||감사합니다:Terima kasih"
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <CreateSet />
      </TestWrapper>
    )

    // Set card delimiter to "||"
    const cardDelimLabel = screen.getByText('Card Delimiter')
    const cardDelimInput = within(cardDelimLabel.closest('div')).getByRole('textbox')
    await user.clear(cardDelimInput)
    await user.type(cardDelimInput, '||')

    // Set language delimiter to ":"
    const langDelimLabel = screen.getByText('Language Delimiter')
    const langDelimInput = within(langDelimLabel.closest('div')).getByRole('textbox')
    await user.clear(langDelimInput)
    await user.type(langDelimInput, ':')

    const textarea = document.querySelector('textarea')
    await user.clear(textarea)
    await user.type(textarea, '안녕하세요:Halo||감사합니다:Terima kasih')

    await waitFor(() => {
      expect(screen.getByText('2 valid cards')).toBeInTheDocument()
    })
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
    expect(screen.getByText('Halo')).toBeInTheDocument()
  })

  it('parses bulk text with custom delimiters (e.g., "::")', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <CreateSet />
      </TestWrapper>
    )

    const cardDelimLabel = screen.getByText('Card Delimiter')
    const cardDelimInput = within(cardDelimLabel.closest('div')).getByRole('textbox')
    await user.clear(cardDelimInput)
    await user.type(cardDelimInput, '||')

    const langDelimLabel = screen.getByText('Language Delimiter')
    const langDelimInput = within(langDelimLabel.closest('div')).getByRole('textbox')
    await user.clear(langDelimInput)
    await user.type(langDelimInput, '::')

    const textarea = document.querySelector('textarea')
    await user.clear(textarea)
    await user.type(textarea, '안녕하세요::Halo||감사합니다::Terima kasih')

    await waitFor(() => {
      expect(screen.getByText('2 valid cards')).toBeInTheDocument()
    })
    expect(screen.getByText('안녕하세요')).toBeInTheDocument()
    expect(screen.getByText('Halo')).toBeInTheDocument()
  })

  it('live preview shows invalid card count when front has no back', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <CreateSet />
      </TestWrapper>
    )

    const textarea = document.querySelector('textarea')
    // Only front side — missing back, so invalid
    await user.type(textarea, '안녕하세요')

    await waitFor(() => {
      expect(screen.getByText('0 valid cards')).toBeInTheDocument()
    })
  })

  it('empty input shows no preview', () => {
    render(
      <TestWrapper>
        <CreateSet />
      </TestWrapper>
    )
    expect(screen.queryByText('Live Preview')).not.toBeInTheDocument()
    expect(screen.queryByText(/valid card/)).not.toBeInTheDocument()
  })

  // ── Create action ───────────────────────────────────────────────────────────

  it('Create button creates set via POST /api/sets', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper>
        <CreateSet />
      </TestWrapper>
    )

    const nameInput = screen.getByPlaceholderText('e.g., Korean Greetings, Basic Verbs...')
    await user.type(nameInput, 'Test Set')

    const textarea = document.querySelector('textarea')
    await user.type(textarea, '안녕하세요 - Halo\n감사합니다 - Terima kasih')

    await waitFor(() => screen.getByText('2 valid cards'))

    await user.click(screen.getByRole('button', { name: /Save Set \(2 cards\)/ }))

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/api/sets',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Test Set',
            cards: [
              { front: '안녕하세요', back: 'Halo' },
              { front: '감사합니다', back: 'Terima kasih' },
            ],
          }),
        })
      )
    })
  })

  it('navigates to home after successful creation', async () => {
    const user = userEvent.setup()
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: 5 }),
    })

    render(
      <TestWrapper>
        <CreateSet />
      </TestWrapper>
    )

    const nameInput = screen.getByPlaceholderText('e.g., Korean Greetings, Basic Verbs...')
    await user.type(nameInput, 'My New Set')

    const textarea = document.querySelector('textarea')
    await user.type(textarea, '안녕하세요 - Halo')

    await waitFor(() => screen.getByText('1 valid card'))

    await user.click(screen.getByRole('button', { name: /Save Set \(1 cards?\)/ }))

    await waitFor(() => {
      expect(screen.getByText('Home')).toBeInTheDocument()
    }, { timeout: 3000 })
  })
})
