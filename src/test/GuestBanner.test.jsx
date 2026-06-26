import { render, screen, waitFor, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MemoryRouter } from 'react-router-dom'

const mockLogout = vi.fn()
let mockUser = null
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, logout: mockLogout }),
}))
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async (orig) => ({
  ...(await orig()),
  useNavigate: () => mockNavigate,
}))

import GuestBanner from '../components/GuestBanner'

function renderBanner() {
  return render(<MemoryRouter><GuestBanner /></MemoryRouter>)
}

describe('GuestBanner', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockLogout.mockReset()
    mockLogout.mockResolvedValue(undefined)
    mockNavigate.mockReset()
  })
  afterEach(() => { vi.useRealTimers() })

  it('renders nothing for a non-guest user', () => {
    mockUser = { id: 1, is_guest: false }
    const { container } = renderBanner()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows remaining time for a guest', () => {
    mockUser = { id: 2, is_guest: true, expires_at: new Date(Date.now() + 125000).toISOString() }
    renderBanner()
    expect(screen.getByText(/guest session/i)).toBeInTheDocument()
    expect(screen.getByText(/02:0/)).toBeInTheDocument()
  })

  it('logs out and navigates when the timer hits zero', async () => {
    mockUser = { id: 3, is_guest: true, expires_at: new Date(Date.now() + 1000).toISOString() }
    renderBanner()
    // Advance fake timers inside act so the interval tick + state update flush.
    // (waitFor polls via setInterval, which is faked here, so assert directly.)
    await act(async () => { vi.advanceTimersByTime(2000) })
    expect(mockLogout).toHaveBeenCalled()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })
})
