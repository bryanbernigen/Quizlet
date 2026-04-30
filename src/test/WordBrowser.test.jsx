import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: Object.fromEntries(
    ['div', 'button', 'span', 'h2', 'h3', 'p', 'li', 'ul', 'form', 'input',
     'td', 'tr', 'th', 'tbody', 'thead', 'table', 'nav', 'section',
     'header', 'footer', 'main', 'article', 'aside', 'img', 'label', 'textarea', 'a']
      .map(tag => [tag, ({ children, ...props }) => React.createElement(tag, props, children)])
  ),
  AnimatePresence: ({ children }) => children,
  useAnimation: () => ({ start: vi.fn() }),
  useInView: () => false,
}))

// vi.hoisted creates stable module-level references that vi.mock can capture
const { authMock, apiFetchMock } = vi.hoisted(() => ({
  authMock: { user: { id: 1, username: 'testuser', token: 'fake-token' } },
  apiFetchMock: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: () => authMock.user,
  useApiFetch: () => apiFetchMock,
}))

function browseResponse(data) {
  return { ok: true, json: () => Promise.resolve({ data }) }
}

function patchResponse() {
  return { ok: true, json: () => Promise.resolve({}) }
}

import WordBrowser from '../pages/WordBrowser'

function renderPage(initialFilter = '') {
  const path = initialFilter ? `/words?filter=${initialFilter}` : '/words'
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WordBrowser />
    </MemoryRouter>
  )
}

describe('WordBrowser', () => {
  const cards = [
    { id: 1, front: '안녕', back: 'Halo', set_name: 'Basics', familiarity: 'neutral', correct_count: 2, incorrect_count: 1 },
    { id: 2, front: '감사', back: 'Terima kasih', set_name: 'Basics', familiarity: 'familiar', correct_count: 5, incorrect_count: 0 },
    { id: 3, front: '고마워', back: 'Terima banyak', set_name: 'Politeness', familiarity: 'unfamiliar', correct_count: 0, incorrect_count: 3 },
  ]

  beforeEach(() => {
    apiFetchMock.mockReset()
    cleanup()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('loads cards on mount', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => expect(screen.getByText('안녕')).toBeInTheDocument())
    expect(apiFetchMock).toHaveBeenCalledWith('/api/cards/browse?limit=100')
  })

  it('shows loading state initially', async () => {
    let release
    apiFetchMock.mockImplementation(() => new Promise(r => (release = r)))
    renderPage()
    expect(screen.getByText('Loading words...')).toBeInTheDocument()
    act(() => release(browseResponse(cards)))
    await waitFor(() => expect(screen.queryByText('Loading words...')).not.toBeInTheDocument())
  })

  it('shows empty state when no cards', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse([]))
    renderPage()
    await waitFor(() => expect(screen.getByText('No words in this category')).toBeInTheDocument())
  })

  it('displays cards grouped by set', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/📚 Basics/)).toBeInTheDocument()
      expect(screen.getByText(/📚 Politeness/)).toBeInTheDocument()
    })
  })

  it('shows card count per set', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText(/Basics \(2\)/)).toBeInTheDocument()
      expect(screen.getByText(/Politeness \(1\)/)).toBeInTheDocument()
    })
  })

  it('search filters cards by front text', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Search Korean/))
    await userEvent.type(screen.getByPlaceholderText(/Search Korean/), '안녕')
    await waitFor(() => {
      expect(screen.getByText('안녕')).toBeInTheDocument()
      expect(screen.queryByText(/Basics \(2\)/)).not.toBeInTheDocument()
    })
  })

  it('search filters cards by set name', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Search Korean/))
    await userEvent.type(screen.getByPlaceholderText(/Search Korean/), 'Politeness')
    await waitFor(() => expect(screen.getByText(/Politeness \(1\)/)).toBeInTheDocument())
  })

  it('search filters cards by back/Indonesian text', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Search Korean/))
    await userEvent.type(screen.getByPlaceholderText(/Search Korean/), 'Terima')
    // Cards 2 and 3 have "Terima" in their back field (card 1 "안녕/Halo" is filtered out)
    await waitFor(() => {
      expect(screen.getByText('감사')).toBeInTheDocument()
      expect(screen.getByText('Terima banyak')).toBeInTheDocument()
      expect(screen.queryByText('안녕')).not.toBeInTheDocument()
    })
  })

  it('search shows "no words match" message when nothing matches', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => screen.getByPlaceholderText(/Search Korean/))
    await userEvent.type(screen.getByPlaceholderText(/Search Korean/), 'xyznonexistent')
    await waitFor(() => expect(screen.getByText('No words match your search')).toBeInTheDocument())
  })

  it('displays all familiarity filter chips', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /All Words/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Familiar/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Neutral/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Unfamiliar/ })).toBeInTheDocument()
    })
  })

  it('clicking Familiar chip changes filter and refetches', async () => {
    apiFetchMock
      .mockResolvedValueOnce(browseResponse(cards))
      .mockResolvedValueOnce(browseResponse(cards.filter(c => c.familiarity === 'familiar')))
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /All Words/ }))
    await userEvent.click(screen.getByRole('button', { name: /Familiar/ }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledTimes(2))
    expect(apiFetchMock).toHaveBeenLastCalledWith('/api/cards/browse?familiarity=familiar&limit=100')
  })

  it('clicking All Words chip removes filter', async () => {
    apiFetchMock
      .mockResolvedValueOnce(browseResponse(cards))
      .mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => screen.getByRole('button', { name: /All Words/ }))
    await userEvent.click(screen.getByRole('button', { name: /^All Words/ }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenLastCalledWith('/api/cards/browse?limit=100'))
  })

  it('uses filter from URL params on mount', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage('familiar')
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/cards/browse?familiarity=familiar&limit=100'))
  })

  it('clicking a familiarity button calls PATCH /api/cards/:id/familiarity', async () => {
    apiFetchMock
      .mockResolvedValueOnce(browseResponse(cards))
      .mockResolvedValueOnce(patchResponse())
    renderPage()
    await waitFor(() => screen.getByText('안녕'))
    // Find the "unfamiliar" recategorize button (❌) in the table — must not be disabled
    const allBtns = screen.getAllByRole('button')
    const unfamiliarBtn = allBtns.find(btn => btn.textContent === '❌' && !btn.disabled)
    expect(unfamiliarBtn).toBeTruthy()
    await userEvent.click(unfamiliarBtn)
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith(
        '/api/cards/1/familiarity',
        expect.objectContaining({ method: 'PATCH' })
      )
    })
  })

  it('clicking active familiarity button does not trigger PATCH', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => screen.getByText('감사'))
    // Find the "familiar" recategorize button (✅) in the table — should be disabled
    const allBtns = screen.getAllByRole('button')
    const familiarBtn = allBtns.find(btn => btn.textContent === '✅' && btn.disabled)
    expect(familiarBtn).toBeTruthy()
    await userEvent.click(familiarBtn)
    expect(apiFetchMock).toHaveBeenCalledTimes(1)
  })

  it('displays card front, back, and stats correctly', async () => {
    apiFetchMock.mockResolvedValueOnce(browseResponse(cards))
    renderPage()
    await waitFor(() => {
      expect(screen.getByText('안녕')).toBeInTheDocument()
      expect(screen.getByText('Halo')).toBeInTheDocument()
      expect(screen.getByText('2✓')).toBeInTheDocument()
      expect(screen.getByText('1✗')).toBeInTheDocument()
      expect(screen.getByText('Neutral')).toBeInTheDocument()
    })
  })
})
