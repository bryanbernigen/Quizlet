/**
 * Tests for AuthContext — AuthProvider, useAuth hook, and useApiFetch helper.
 *
 * These tests verify:
 * - AuthProvider renders its children
 * - useAuth returns the expected shape: { user, loading, login, logout, token }
 * - login() stores the token in localStorage and calls /api/auth/login
 * - logout() clears localStorage and sets user to null
 * - On mount with a valid token: calls /api/auth/me and sets the user
 * - On mount with an invalid/expired token: sets user to null
 * - useApiFetch attaches the Authorization header and handles 401 responses
 */

import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { useEffect, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { AuthProvider, useAuth, useApiFetch } from '../context/AuthContext'

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

/** Renders the useAuth return value for inspection. */
function AuthInspector({ onRender }) {
  const auth = useAuth()
  useEffect(() => { onRender(auth) }, [auth])
  return <pre data-testid="auth-value">{JSON.stringify(auth)}</pre>
}

/** Renders a child so we can confirm the provider passes children through. */
function ChildOnly({ onMount }) {
  useEffect(() => { onMount() }, [])
  return <div data-testid="child">I am the child</div>
}

/** Calls useApiFetch and exposes its result via a data-testid. */
function ApiFetchInspector({ url, options, onResult }) {
  const apiFetch = useApiFetch()
  const [result, setResult] = useState(null)

  useEffect(() => {
    let cancelled = false
    apiFetch(url, options)
      .then(r => r.json())
      .then(data => { if (!cancelled) setResult({ status: 200, data }) })
      .catch(err => { if (!cancelled) setResult({ error: err.message }) })
    return () => { cancelled = true }
  }, [apiFetch])

  if (result === null) return <div data-testid="loading">loading</div>
  return <pre data-testid="api-result">{JSON.stringify(result)}</pre>
}

// ---------------------------------------------------------------------------
// Cleanup between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  global.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthProvider — children rendering', () => {
  it('renders children', () => {
    let mounted = false
    render(
      <AuthProvider>
        <ChildOnly onMount={() => { mounted = true }} />
      </AuthProvider>
    )
    expect(mounted).toBe(true)
  })
})

describe('useAuth — return shape', () => {
  it('returns an object with user, loading, login, logout, token', async () => {
    let captured = null
    render(
      <AuthProvider>
        <AuthInspector onRender={auth => { captured = auth }} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(captured).not.toBeNull()
    })

    expect(captured).toMatchObject({
      user: null,
      loading: false,
      login: expect.any(Function),
      logout: expect.any(Function),
      token: null,
    })
  })
})

describe('login()', () => {
  it('stores the token in localStorage and calls /api/auth/login', async () => {
    const mockUser = { id: 1, username: 'testuser' }
    const mockToken = 'test-token-abc123'

    global.fetch = vi.fn((url, options) => {
      if (url === '/api/auth/login' && options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ token: mockToken, user: mockUser }),
        })
      }
      // When login() calls setToken(), it triggers the mount useEffect which
      // calls /api/auth/me — respond to that too.
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockUser),
        })
      }
      return Promise.reject(new Error(`Unexpected fetch call: ${url}`))
    })

    let capturedAuth = null
    function TestComponent() {
      const auth = useAuth()
      useEffect(() => { capturedAuth = auth }, [auth])
      return <button onClick={() => auth.login('testuser', 'password')}>Login</button>
    }

    const { getByRole } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // Click the button — this triggers auth.login() which synchronously stores
    // the token to localStorage before the async fetch completes.
    getByRole('button', { name: 'Login' }).click()

    // Wait for the fetch + state update cycle to complete.
    await waitFor(() => {
      expect(capturedAuth?.user).toEqual(mockUser)
    })

    // Verify fetch was called with the correct arguments.
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'testuser', password: 'password' }),
      })
    )

    // Verify token is stored in localStorage (set synchronously inside login()).
    expect(localStorage.getItem('koreaquiz_token')).toBe(mockToken)
  })

  it('throws an error when login fails', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      })
    )

    let capturedAuth = null
    function TestComponent() {
      const auth = useAuth()
      useEffect(() => { capturedAuth = auth }, [auth])
      return <button onClick={() => auth.login('bad', 'creds')}>Login</button>
    }

    const { getByRole } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    // The error is caught inside login() but the state doesn't change on error
    // (the component's try/catch just prevents crashing).
    let thrown = null
    await act(async () => {
      try {
        await capturedAuth.login('bad', 'creds')
      } catch (e) {
        thrown = e
      }
    })

    expect(thrown).toBeInstanceOf(Error)
    expect(thrown.message).toBe('Invalid credentials')
    expect(capturedAuth.user).toBe(null)
  })
})

describe('logout()', () => {
  it('clears localStorage token and sets user to null', async () => {
    // Pre-populate localStorage with a token to simulate a logged-in session.
    localStorage.setItem('koreaquiz_token', 'some-token')

    global.fetch = vi.fn(() => Promise.resolve({ ok: true }))

    let capturedAuth = null
    function TestComponent() {
      const auth = useAuth()
      useEffect(() => { capturedAuth = auth }, [auth])
      return <button onClick={() => auth.logout()}>Logout</button>
    }

    const { getByRole } = render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    )

    await act(async () => {
      getByRole('button', { name: 'Logout' }).click()
      await new Promise(r => setTimeout(r, 50))
    })

    expect(localStorage.getItem('koreaquiz_token')).toBeNull()
    await waitFor(() => {
      expect(capturedAuth?.user).toBeNull()
    })
    expect(capturedAuth?.token).toBeNull()
  })
})

describe('AuthProvider — mount behavior with token', () => {
  it('calls /api/auth/me when mounted with a valid token and sets the user', async () => {
    const mockUser = { id: 42, username: 'validuser' }

    global.fetch = vi.fn((url) => {
      if (url === '/api/auth/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockUser),
        })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })

    // Simulate a pre-existing token in localStorage.
    localStorage.setItem('koreaquiz_token', 'valid-token-xyz')

    let capturedAuth = null
    render(
      <AuthProvider>
        <AuthInspector onRender={auth => { capturedAuth = auth }} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/auth/me',
        expect.objectContaining({
          headers: { Authorization: 'Bearer valid-token-xyz' },
        })
      )
    })

    await waitFor(() => {
      expect(capturedAuth?.user).toEqual(mockUser)
    })
    expect(capturedAuth?.loading).toBe(false)
  })

  it('sets user to null when the token is invalid/expired', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({}),
      })
    )

    localStorage.setItem('koreaquiz_token', 'expired-token')

    let capturedAuth = null
    render(
      <AuthProvider>
        <AuthInspector onRender={auth => { capturedAuth = auth }} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(capturedAuth?.user).toBeNull()
    })
    expect(capturedAuth?.loading).toBe(false)
    // The invalid token should have been cleared from localStorage.
    expect(localStorage.getItem('koreaquiz_token')).toBeNull()
  })

  it('does not call /api/auth/me when there is no token', async () => {
    global.fetch = vi.fn()

    let capturedAuth = null
    render(
      <AuthProvider>
        <AuthInspector onRender={auth => { capturedAuth = auth }} />
      </AuthProvider>
    )

    await waitFor(() => {
      expect(capturedAuth?.loading).toBe(false)
    })

    expect(global.fetch).not.toHaveBeenCalled()
    expect(capturedAuth?.user).toBeNull()
    expect(capturedAuth?.token).toBeNull()
  })
})

describe('useApiFetch', () => {
  it('attaches the Authorization header when a token is present', async () => {
    const mockToken = 'bearer-token-xyz'
    localStorage.setItem('koreaquiz_token', mockToken)

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'ok' }),
      })
    )

    function TestComponent() {
      return (
        <AuthProvider>
          <ApiFetchInspector url="/api/some-endpoint" options={{ method: 'GET' }} onResult={() => {}} />
        </AuthProvider>
      )
    }

    render(<TestComponent />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/some-endpoint',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockToken}`,
        }),
      })
    )
  })

  it('does not attach an Authorization header when there is no token', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ data: 'ok' }),
      })
    )

    function TestComponent() {
      return (
        <AuthProvider>
          <ApiFetchInspector url="/api/public" options={{ method: 'GET' }} onResult={() => {}} />
        </AuthProvider>
      )
    }

    render(<TestComponent />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const call = global.fetch.mock.calls[0]
    // The headers object should not have an Authorization entry when no token exists.
    const headers = call[1]?.headers
    expect(headers?.Authorization).toBeUndefined()
  })

  it('handles 401 by clearing token, reloading the page, and throwing', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
      })
    )

    // Provide a token so the auth flow proceeds.
    localStorage.setItem('koreaquiz_token', 'token-before-401')

    // Spy on window.location.reload without replacing the property.
    const reloadSpy = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    })

    function TestComponent() {
      return (
        <AuthProvider>
          <ApiFetchInspector url="/api/protected" options={{ method: 'GET' }} onResult={() => {}} />
        </AuthProvider>
      )
    }

    render(<TestComponent />)

    // Wait for the 401 to be processed.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    await waitFor(() => {
      // The 401 handler removes the token from localStorage.
      expect(localStorage.getItem('koreaquiz_token')).toBeNull()
    })
    expect(reloadSpy).toHaveBeenCalled()
  })

  it('sets Content-Type header when body is a string', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      })
    )

    function TestComponent() {
      return (
        <AuthProvider>
          <ApiFetchInspector
            url="/api/create"
            options={{ method: 'POST', body: JSON.stringify({ name: 'test' }) }}
            onResult={() => {}}
          />
        </AuthProvider>
      )
    }

    render(<TestComponent />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled()
    })

    const call = global.fetch.mock.calls[0]
    expect(call[1].headers?.['Content-Type']).toBe('application/json')
  })
})
