import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'
import { AuthContext } from '../context/AuthContext'

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

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useNavigate: () => mockNavigate }
})

// --- AuthContext mock (hoisted so it's stable) ---
const { authMock, apiFetchMock } = vi.hoisted(() => ({
  authMock: { user: null, logout: vi.fn(), token: null },
  apiFetchMock: vi.fn(),
}))

vi.mock('../context/AuthContext', () => ({
  __esModule: true,
  AuthContext: { Provider: ({ children }) => children },
  useAuth: () => ({ user: authMock.user, logout: authMock.logout, token: authMock.token }),
  useApiFetch: () => apiFetchMock,
}))

function okResponse(data) {
  return { ok: true, json: () => Promise.resolve(data) }
}
function errResponse(status = 500, data = { error: 'Server error' }) {
  return { ok: false, status, json: () => Promise.resolve(data) }
}

// URL-aware mock for the admin views. The admin page fires three loads on mount
// (/api/admin/users, /api/admin/guests, /api/admin/settings) plus mutation
// calls, so order-based mockResolvedValueOnce is too fragile — route by URL.
function installAdminApi({ users = [], guests = [], settings = { guest_ttl_minutes: 60, guest_max_concurrent: 10 }, overrides = {} } = {}) {
  const state = { users: [...users], guests: [...guests], settings: { ...settings } }
  apiFetchMock.mockImplementation((url, options = {}) => {
    const method = options.method || 'GET'
    const key = `${method} ${url}`
    if (key in overrides) return Promise.resolve(overrides[key])
    if (url === '/api/admin/users' && method === 'GET') return Promise.resolve(okResponse(state.users))
    if (url === '/api/admin/guests' && method === 'GET') return Promise.resolve(okResponse(state.guests))
    if (url === '/api/admin/settings' && method === 'GET') return Promise.resolve(okResponse(state.settings))
    if (url === '/api/admin/settings' && method === 'PUT') {
      state.settings = { ...state.settings, ...JSON.parse(options.body) }
      return Promise.resolve(okResponse(state.settings))
    }
    if (url === '/api/admin/users' && method === 'POST') {
      const body = JSON.parse(options.body)
      const u = { id: 99, username: body.username, is_admin: !!body.is_admin, created_at: '2024-03-01' }
      state.users = [...state.users, u]
      return Promise.resolve(okResponse({ user: u }))
    }
    if (/\/api\/admin\/users\/\d+$/.test(url) && method === 'DELETE') {
      const id = Number(url.split('/').pop())
      state.users = state.users.filter(u => u.id !== id)
      state.guests = state.guests.filter(g => g.id !== id)
      return Promise.resolve(okResponse({ deleted: true }))
    }
    return Promise.resolve(okResponse({}))
  })
  return state
}

import ProfilePage from '../pages/ProfilePage'

// --- DOM mocks ---
let mockClick
let createdAnchor

beforeEach(() => {
  mockNavigate.mockReset()
  authMock.user = null
  authMock.token = null
  authMock.logout = vi.fn()
  apiFetchMock.mockReset()
  mockClick = vi.fn()
  createdAnchor = null
  URL.createObjectURL = vi.fn(() => 'blob:http://localhost/mock-blob')
  URL.revokeObjectURL = vi.fn()
  const origCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'a') {
      createdAnchor = { href: '', download: '', click: mockClick, style: {}, appendChild: vi.fn() }
      return createdAnchor
    }
    return origCreateElement(tag)
  })
  cleanup()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function renderWithAuth(user = null) {
  authMock.user = user
  authMock.token = user ? 'fake-token' : null
  return render(
    <AuthContext.Provider value={{ user: authMock.user, logout: authMock.logout, token: authMock.token, apiFetch: apiFetchMock }}>
      <MemoryRouter><ProfilePage /></MemoryRouter>
    </AuthContext.Provider>
  )
}

describe('ProfilePage', () => {
  it('displays username', async () => {
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => expect(screen.getByText('testuser')).toBeInTheDocument())
  })

  // --- Export ---
  it('export button calls GET /api/export and triggers file download', async () => {
    apiFetchMock.mockResolvedValueOnce(okResponse({ sets: [], cards: [] }))
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => screen.getByText('Export'))
    await userEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/export'))
    expect(mockClick).toHaveBeenCalled()
    expect(createdAnchor.download).toMatch(/^koreaquiz-testuser-/)
    expect(createdAnchor.download).toMatch(/\.json$/)
  })

  it('export shows error on failure', async () => {
    apiFetchMock.mockResolvedValueOnce(errResponse(500, { error: 'Export failed' }))
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => screen.getByText('Export'))
    await userEvent.click(screen.getByText('Export'))
    await waitFor(() => expect(screen.getByText(/Export failed/)).toBeInTheDocument())
  })

  // --- Import ---
  it('import accepts JSON file and shows success', async () => {
    apiFetchMock.mockResolvedValueOnce(okResponse({ setsCreated: 2, setsUpdated: 1, cardsCreated: 10, cardsUpdated: 5 }))
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => screen.getByText('Import'))
    const fileInput = document.querySelector('input[type="file"]')
    expect(fileInput).toBeTruthy()
    await userEvent.upload(fileInput, new File(['{"sets":[]}'], 'backup.json', { type: 'application/json' }))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/import', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(screen.getByText(/2 sets created/)).toBeInTheDocument())
  })

  it('import shows error for invalid JSON', async () => {
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => screen.getByText('Import'))
    const fileInput = document.querySelector('input[type="file"]')
    await userEvent.upload(fileInput, new File(['not json'], 'bad.json', { type: 'application/json' }))
    await waitFor(() => expect(screen.getByText(/Invalid JSON file/)).toBeInTheDocument())
    expect(apiFetchMock).not.toHaveBeenCalled()
  })

  it('import shows error on API failure', async () => {
    apiFetchMock.mockResolvedValueOnce(errResponse(400, { error: 'Invalid import data' }))
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => screen.getByText('Import'))
    const fileInput = document.querySelector('input[type="file"]')
    await userEvent.upload(fileInput, new File(['{"sets":[]}'], 'backup.json', { type: 'application/json' }))
    await waitFor(() => expect(screen.getByText(/Invalid import data/)).toBeInTheDocument())
  })

  // --- Admin mode ---
  it('admin sees user management section', async () => {
    installAdminApi({ users: [
      { id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' },
      { id: 2, username: 'alice', is_admin: false, created_at: '2024-02-01' },
    ] })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => {
      expect(screen.getByText(/User Management/)).toBeInTheDocument()
      expect(screen.getByText(/Create New User/)).toBeInTheDocument()
    })
  })

  it('admin lists users with join date', async () => {
    installAdminApi({ users: [
      { id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' },
      { id: 2, username: 'alice', is_admin: false, created_at: '2024-02-15' },
    ] })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => {
      expect(screen.getAllByText(/^alice$/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/^admin$/).length).toBeGreaterThan(0)
      expect(screen.getAllByText(/Joined/).length).toBeGreaterThanOrEqual(2)
    })
  })

  it('admin has ADMIN badge', async () => {
    installAdminApi({ users: [{ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' }] })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => expect(screen.getByText(/^admin$/)).toBeInTheDocument())
    expect(screen.getAllByText('ADMIN').length).toBeGreaterThan(0)
  })

  it('create user form calls API', async () => {
    installAdminApi({ users: [{ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' }] })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => screen.getByText(/Create New User/))
    await userEvent.type(screen.getByPlaceholderText('At least 3 characters'), 'bob')
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'password123')
    await userEvent.click(screen.getByText(/Create User/))
    await waitFor(() => expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({ method: 'POST' })))
  })

  it('create user form shows error on failure', async () => {
    installAdminApi({
      users: [{ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' }],
      overrides: { 'POST /api/admin/users': errResponse(400, { error: 'Username already taken' }) },
    })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => screen.getByText(/Create New User/))
    await userEvent.type(screen.getByPlaceholderText('At least 3 characters'), 'takenuser')
    await userEvent.type(screen.getByPlaceholderText('At least 8 characters'), 'password123')
    await userEvent.click(screen.getByText(/Create User/))
    await waitFor(() => expect(screen.getByText(/Username already taken/)).toBeInTheDocument())
  })

  it('delete button removes user from list', async () => {
    installAdminApi({ users: [
      { id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' },
      { id: 2, username: 'alice', is_admin: false, created_at: '2024-02-01' },
    ] })
    const origConfirm = window.confirm
    window.confirm = vi.fn(() => true)
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => { expect(screen.getAllByText(/^alice$/).length).toBeGreaterThan(0) })
    await userEvent.click(screen.getAllByText('Delete')[0])
    await waitFor(() => expect(window.confirm).toHaveBeenCalledWith('Delete user "alice"? This will remove all their data.'))
    expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/users/2', { method: 'DELETE' })
    await waitFor(() => expect(screen.queryByText(/^alice$/)).not.toBeInTheDocument())
    window.confirm = origConfirm
  })

  it('admin cannot delete own account', async () => {
    installAdminApi({ users: [{ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' }] })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => expect(screen.getByText(/^admin$/)).toBeInTheDocument())
    expect(screen.queryAllByText('Delete')).toHaveLength(0)
  })

  // --- Guest management ---
  it('renders active guests and terminates one', async () => {
    installAdminApi({
      users: [{ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' }],
      guests: [{ id: 5, username: 'guest_abc', created_at: '2024-05-01T10:00:00Z',
                 expires_at: new Date(Date.now() + 30 * 60000).toISOString(), set_count: 2, card_count: 11 }],
    })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => expect(screen.getByText('guest_abc')).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: /terminate/i }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/users/5', expect.objectContaining({ method: 'DELETE' }))
    )
  })

  it('saves guest settings', async () => {
    installAdminApi({ users: [{ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' }] })
    renderWithAuth({ id: 1, username: 'admin', is_admin: true, created_at: '2024-01-01' })
    await waitFor(() => expect(screen.getByLabelText(/guest duration/i)).toBeInTheDocument())
    await userEvent.clear(screen.getByLabelText(/guest duration/i))
    await userEvent.type(screen.getByLabelText(/guest duration/i), '30')
    await userEvent.click(screen.getByRole('button', { name: /save guest settings/i }))
    await waitFor(() =>
      expect(apiFetchMock).toHaveBeenCalledWith('/api/admin/settings', expect.objectContaining({ method: 'PUT' }))
    )
  })

  it('non-admin does not see user management', async () => {
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => expect(screen.queryByText(/User Management/)).not.toBeInTheDocument())
  })

  it('logout navigates home', async () => {
    renderWithAuth({ id: 1, username: 'testuser', is_admin: false, created_at: '2024-01-15' })
    await waitFor(() => screen.getByText(/Log Out/))
    await userEvent.click(screen.getByText(/Log Out/))
    await waitFor(() => expect(authMock.logout).toHaveBeenCalled())
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
