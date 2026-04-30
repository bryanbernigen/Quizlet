/**
 * Tests for LoginPage component.
 *
 * These tests verify:
 * - The login form renders with username/password inputs and a submit button
 * - An error message is displayed when login fails
 * - A loading state is shown during login (button disabled, "..." text)
 * - login() from AuthContext is called with the correct credentials on submit
 * - The button re-enables after login completes (success or failure)
 */

import { render, screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// Mock framer-motion so animations don't delay rendering.
// The motion stubs strip framer-motion-specific props to avoid React warnings.
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }) => {
      // eslint-disable-next-line no-unused-vars
      const { initial, animate, exit, transition, whileHover, whileTap, variants, ...rest } = props
      return <div {...rest}>{children}</div>
    },
    button: ({ children, ...props }) => {
      // eslint-disable-next-line no-unused-vars
      const { initial, animate, whileHover, whileTap, transition, variants, ...rest } = props
      return <button {...rest}>{children}</button>
    },
  },
}))

// ---------------------------------------------------------------------------
// Mock AuthContext — provides a controlled login() for LoginPage to call.
// The LoginPage only calls useAuth() which returns { login }.
// ---------------------------------------------------------------------------

const mockLogin = vi.fn()
const mockLogout = vi.fn()

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    token: null,
    login: mockLogin,
    logout: mockLogout,
  }),
  useApiFetch: vi.fn(),
}))

import LoginPage from '../pages/LoginPage'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderLoginPage() {
  const user = userEvent.setup()
  return {
    user,
    ...render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    ),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoginPage — form rendering', () => {
  it('renders login form with username and password inputs and a submit button', async () => {
    renderLoginPage()

    // Wait for the DOM to settle.
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument()
    })
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log in/i })).toBeInTheDocument()
  })

  it('renders the KoreaQuiz title', async () => {
    renderLoginPage()

    await waitFor(() => {
      expect(screen.getByText('KoreaQuiz')).toBeInTheDocument()
    })
  })

  it('renders inputs with the correct autocomplete attributes', async () => {
    renderLoginPage()

    await waitFor(() => {
      const usernameInput = screen.getByPlaceholderText('Enter username')
      const passwordInput = screen.getByPlaceholderText('Enter password')
      expect(usernameInput).toHaveAttribute('autocomplete', 'username')
      expect(passwordInput).toHaveAttribute('autocomplete', 'current-password')
    })
  })
})

describe('LoginPage — error display', () => {
  beforeEach(() => {
    mockLogin.mockReset()
  })

  it('shows an error message when login fails', async () => {
    mockLogin.mockRejectedValueOnce(new Error('Invalid credentials'))

    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter username'), 'baduser')
    await user.type(screen.getByPlaceholderText('Enter password'), 'badpassword')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
    })
  })

  it('clears previous error message on a new submit attempt', async () => {
    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    const usernameInput = screen.getByPlaceholderText('Enter username')
    const passwordInput = screen.getByPlaceholderText('Enter password')

    // First call fails.
    mockLogin.mockRejectedValueOnce(new Error('First error'))
    await user.type(usernameInput, 'user')
    await user.type(passwordInput, 'pass')
    await user.click(screen.getByRole('button', { name: /log in/i }))
    await waitFor(() => {
      expect(screen.getByText('First error')).toBeInTheDocument()
    })

    // Second call succeeds, which clears the error.
    mockLogin.mockResolvedValueOnce({})
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.queryByText('First error')).not.toBeInTheDocument()
    })
  })

  it('does not show an error message before any login attempt', async () => {
    renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    // No error div should be visible before any submit.
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
  })
})

describe('LoginPage — loading state', () => {
  beforeEach(() => {
    mockLogin.mockReset()
  })

  it('shows a loading indicator during login (button disabled, "..." text)', async () => {
    // Make login hang until we manually resolve it.
    let resolveLogin
    mockLogin.mockImplementation(() => new Promise(r => { resolveLogin = r }))

    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter username'), 'user')
    await user.type(screen.getByPlaceholderText('Enter password'), 'password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    // Button should be disabled and show "...".
    await waitFor(() => {
      const btn = screen.getByRole('button')
      expect(btn).toBeDisabled()
      expect(btn).toHaveTextContent('...')
    })

    // Unblock login and let the component settle.
    await act(async () => { resolveLogin() })
    await waitFor(() => {
      expect(screen.getByRole('button')).not.toBeDisabled()
    })
  })

  it('re-enables the button after login succeeds', async () => {
    mockLogin.mockResolvedValue({ user: { id: 1 }, token: 'tok' })

    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter username'), 'user')
    await user.type(screen.getByPlaceholderText('Enter password'), 'password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByRole('button')).not.toBeDisabled()
    })
  })

  it('re-enables the button after login fails', async () => {
    mockLogin.mockRejectedValue(new Error('Bad creds'))

    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter username'), 'user')
    await user.type(screen.getByPlaceholderText('Enter password'), 'password')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(screen.getByText('Bad creds')).toBeInTheDocument()
      expect(screen.getByRole('button')).not.toBeDisabled()
    })
  })
})

describe('LoginPage — calls login() on submit', () => {
  beforeEach(() => {
    mockLogin.mockReset()
    mockLogin.mockResolvedValue({ user: { id: 1 }, token: 'abc' })
  })

  it('calls login() with the entered username and password', async () => {
    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter username'), 'myusername')
    await user.type(screen.getByPlaceholderText('Enter password'), 'mysecretpassword')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1)
      expect(mockLogin).toHaveBeenCalledWith('myusername', 'mysecretpassword')
    })
  })

  it('does not call login() when inputs are empty due to HTML5 required validation', async () => {
    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    // Don't type anything; just click submit.
    // The required attribute on inputs should prevent form submission.
    await user.click(screen.getByRole('button', { name: /log in/i }))

    expect(mockLogin).not.toHaveBeenCalled()
  })

  it('passes input values as-is to login()', async () => {
    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter username'), '  user with spaces  ')
    await user.type(screen.getByPlaceholderText('Enter password'), 'pass123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith('  user with spaces  ', 'pass123')
    })
  })
})

describe('LoginPage — successful login flow', () => {
  beforeEach(() => {
    mockLogin.mockReset()
  })

  it('completes the login flow without throwing when login() succeeds', async () => {
    mockLogin.mockResolvedValue({ user: { id: 1, username: 'test' }, token: 'tok' })

    const { user } = renderLoginPage()
    await waitFor(() => expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument())

    await user.type(screen.getByPlaceholderText('Enter username'), 'testuser')
    await user.type(screen.getByPlaceholderText('Enter password'), 'password123')
    await user.click(screen.getByRole('button', { name: /log in/i }))

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalled()
      // No error should be visible after a successful login.
      expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
    })
  })
})
