import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
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

const { authMock, apiFetchMock, mockNavigate } = vi.hoisted(() => ({
  authMock: { user: null },
  apiFetchMock: vi.fn(),
  mockNavigate: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children),
  }
})

vi.mock('../context/AuthContext', () => ({
  __esModule: true,
  AuthContext: { Provider: ({ children }) => children },
  useAuth: () => authMock,
  useApiFetch: () => apiFetchMock,
}))

const mockSharedData = {
  set: { id: 1, name: 'Daily Korean 100', card_count: 3 },
  cards: [
    { id: 10, front: '안녕', back: 'Halo' },
    { id: 20, front: '감사', back: 'Terima kasih' },
    { id: 30, front: '고마워', back: 'Terima banyak' },
  ],
}

function sharedResponse(data) {
  return { ok: true, json: () => Promise.resolve(data) }
}

function notFoundResponse() {
  return { ok: false, status: 404, json: () => Promise.resolve({ error: 'Not found' }) }
}

function copyResponse(success = true) {
  return { ok: success, json: () => Promise.resolve(success ? { id: 5 } : { error: 'Failed to copy' }) }
}

import SharedSet from '../pages/SharedSet'
import { AuthContext } from '../context/AuthContext'

describe('SharedSet', () => {
  beforeEach(() => {
    mockNavigate.mockReset()
    authMock.user = null
    apiFetchMock.mockReset()
    vi.spyOn(window, 'fetch').mockReset()
    cleanup()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  function renderSharedSet(user = null) {
    authMock.user = user
    return render(
      <AuthContext.Provider value={{ user: authMock.user, apiFetch: apiFetchMock }}>
        <MemoryRouter initialEntries={['/shared/test-token-123']}>
          <Routes>
            <Route path="/shared/:shareToken" element={<SharedSet />} />
            <Route path="/manage" element={React.createElement('div', null, 'Manage')} />
            <Route path="/review" element={React.createElement('div', null, 'Review')} />
            <Route path="/quiz" element={React.createElement('div', null, 'Quiz')} />
            <Route path="/" element={React.createElement('div', null, 'Dashboard')} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>
    )
  }

  it('loads set from /api/shared/:shareToken on mount', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    renderSharedSet(null)
    await waitFor(() => expect(screen.getByText('Daily Korean 100')).toBeInTheDocument())
    expect(window.fetch).toHaveBeenCalledWith('/api/shared/test-token-123')
  })

  it('shows loading state initially', async () => {
    let release
    window.fetch.mockImplementation(() => new Promise(r => (release = r)))
    renderSharedSet(null)
    expect(screen.getByText('Loading...')).toBeInTheDocument()
    act(() => release(sharedResponse(mockSharedData)))
    await waitFor(() => expect(screen.queryByText('Loading...')).not.toBeInTheDocument())
  })

  it('shows "Set Not Available" on 404', async () => {
    window.fetch.mockResolvedValueOnce(notFoundResponse())
    renderSharedSet(null)
    await waitFor(() => {
      expect(screen.getByText('Set Not Available')).toBeInTheDocument()
      expect(screen.getByText('Set not found or no longer shared')).toBeInTheDocument()
    })
  })

  it('displays set name and card count', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    renderSharedSet(null)
    await waitFor(() => {
      expect(screen.getByText('Daily Korean 100')).toBeInTheDocument()
      expect(screen.getByText('3 cards · Shared set')).toBeInTheDocument()
    })
  })

  it('displays card preview table', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    renderSharedSet(null)
    await waitFor(() => {
      expect(screen.getByText('안녕')).toBeInTheDocument()
      expect(screen.getByText('Halo')).toBeInTheDocument()
      expect(screen.getByText('감사')).toBeInTheDocument()
      expect(screen.getByText('Terima banyak')).toBeInTheDocument()
    })
  })

  it('Review button links to /review?sharedSet=', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    renderSharedSet(null)
    await waitFor(() => screen.getByText('Review'))
    const reviewLink = screen.getByRole('link', { name: /Review/i })
    expect(reviewLink.getAttribute('href')).toBe('/review?sharedSet=test-token-123')
  })

  it('Take Quiz button links to /quiz?sharedSet=', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    renderSharedSet(null)
    await waitFor(() => screen.getByText('Take Quiz'))
    const quizLink = screen.getByRole('link', { name: /Take Quiz/i })
    expect(quizLink.getAttribute('href')).toBe('/quiz?sharedSet=test-token-123')
  })

  it('when NOT logged in: shows "Log in" link', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    renderSharedSet(null)
    await waitFor(() => {
      expect(screen.getByText('Save to My Sets')).toBeInTheDocument()
      expect(screen.getByText('Log in')).toBeInTheDocument()
    })
  })

  it('when logged in: "Save" button is visible', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    renderSharedSet({ id: 42, username: 'testuser' })
    await waitFor(() => screen.getByText('Save to My Sets'))
    expect(screen.getByRole('button', { name: /Save/i })).toBeInTheDocument()
  })

  it('when logged in: clicking Save calls POST /api/shared/:shareToken/copy', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    apiFetchMock.mockResolvedValueOnce(copyResponse(true))
    renderSharedSet({ id: 42, username: 'testuser' })
    await waitFor(() => screen.getByRole('button', { name: /Save/i }))
    await userEvent.click(screen.getByRole('button', { name: /Save/i }))
    await waitFor(() => {
      expect(apiFetchMock).toHaveBeenCalledWith('/api/shared/test-token-123/copy', { method: 'POST' })
    })
  })

  it('on successful save: shows toast', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    apiFetchMock.mockResolvedValueOnce(copyResponse(true))
    renderSharedSet({ id: 42, username: 'testuser' })
    await waitFor(() => screen.getByRole('button', { name: /Save/i }))
    await userEvent.click(screen.getByRole('button', { name: /Save/i }))
    await waitFor(() => expect(screen.getByText('Saved to your sets!')).toBeInTheDocument())
  })

  it('on failed save: shows error toast', async () => {
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    apiFetchMock.mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Failed to copy' }) })
    renderSharedSet({ id: 42, username: 'testuser' })
    await waitFor(() => screen.getByRole('button', { name: /Save/i }))
    await userEvent.click(screen.getByRole('button', { name: /Save/i }))
    await waitFor(() => expect(screen.getByText('Failed to copy')).toBeInTheDocument())
  })

  it('shows "Saving..." while copy is in progress', async () => {
    let release
    window.fetch.mockResolvedValueOnce(sharedResponse(mockSharedData))
    apiFetchMock.mockImplementation(() => new Promise(r => (release = r)))
    renderSharedSet({ id: 42, username: 'testuser' })
    await waitFor(() => screen.getByRole('button', { name: /Save/i }))
    await userEvent.click(screen.getByRole('button', { name: /Save/i }))
    expect(screen.getByText('Saving...')).toBeInTheDocument()
    act(() => release(copyResponse(true)))
    await waitFor(() => expect(screen.queryByText('Saving...')).not.toBeInTheDocument())
  })
})
