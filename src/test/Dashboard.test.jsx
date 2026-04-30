/**
 * Tests for Dashboard component.
 *
 * These tests verify:
 * - Shows a loading skeleton / indicator while fetching stats
 * - Shows an error state when the API call fails
 * - Renders stats cards with the correct values
 * - Renders the familiarity bar with correct legend labels
 * - Renders the trouble words table when trouble words are present
 * - Trouble word rows contain the expected content
 * - Shows an empty state when there are no trouble words
 * - Quick Action cards link to the correct routes
 */

import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'

// Mock framer-motion so animations don't delay rendering.
// The motion.div and motion.button stubs must strip framer-motion-specific props
// so they don't leak into the DOM and trigger React warnings.
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
// Mock AuthContext — provides controlled useAuth / useApiFetch.
// NOTE: We must re-export AuthProvider so the wrapper can use it.
// ---------------------------------------------------------------------------

const mockApiFetch = vi.fn()

vi.mock('../context/AuthContext', () => ({
  // Re-export AuthProvider so the test can wrap the component.
  AuthProvider: ({ children }) => children,
  useAuth: () => ({
    user: { id: 1, username: 'testuser' },
    loading: false,
    token: 'mock-token',
    login: vi.fn(),
    logout: vi.fn(),
  }),
  useApiFetch: () => mockApiFetch,
}))

import Dashboard from '../pages/Dashboard'

// ---------------------------------------------------------------------------
// Test data factory
// ---------------------------------------------------------------------------

function makeStats(overrides = {}) {
  return {
    totalSets: 5,
    totalCards: 120,
    familiarity: { familiar: 80, neutral: 25, unfamiliar: 15 },
    troubleWords: [],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Helper — sets up the mock response and renders Dashboard.
// ---------------------------------------------------------------------------

function renderDashboard(statsOverride) {
  // Only reset when we have an explicit override to set.
  // This lets loading-state tests configure the mock before calling render.
  if (statsOverride !== undefined) {
    mockApiFetch.mockReset()
  }

  if (statsOverride instanceof Error) {
    mockApiFetch.mockRejectedValueOnce(statsOverride)
  } else if (statsOverride !== undefined) {
    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve(statsOverride),
    })
  }

  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Dashboard — loading state', () => {
  beforeEach(() => {
    // Return a never-resolving Promise so the useEffect stays pending.
    mockApiFetch.mockReturnValue(new Promise(() => {}))
  })

  afterEach(() => {
    mockApiFetch.mockReset()
  })

  it('does not render stats cards while fetching (stats are null)', async () => {
    renderDashboard()

    // While the fetch is pending, stats should not be in the DOM.
    await waitFor(() => {
      expect(screen.queryByText('Total Sets')).not.toBeInTheDocument()
    })
  })
})

describe('Dashboard — error state', () => {
  afterEach(() => {
    mockApiFetch.mockReset()
  })

  it('shows an error message when the API call fails', async () => {
    renderDashboard(new Error('Network error'))

    await waitFor(() => {
      expect(screen.getByText(/failed to load/i)).toBeInTheDocument()
    })
  })

  it('renders Quick Action cards even when stats fail to load', async () => {
    renderDashboard(new Error('Network error'))

    await waitFor(() => {
      expect(screen.getByText('Manage Sets')).toBeInTheDocument()
      expect(screen.getByText('Review Now')).toBeInTheDocument()
      expect(screen.getByText('Take Quiz')).toBeInTheDocument()
    })
  })
})

describe('Dashboard — stats cards', () => {
  afterEach(() => {
    mockApiFetch.mockReset()
  })

  it('renders all five stats cards with the correct values', async () => {
    renderDashboard(makeStats({ totalSets: 10, totalCards: 500 }))

    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument()
      expect(screen.getByText('500')).toBeInTheDocument()
    })

    expect(screen.getByText('80')).toBeInTheDocument() // Familiar
    expect(screen.getByText('25')).toBeInTheDocument() // Neutral
    expect(screen.getByText('15')).toBeInTheDocument() // Unfamiliar
  })

  it('renders the correct stat card labels', async () => {
    renderDashboard(makeStats())

    await waitFor(() => {
      expect(screen.getByText('Total Sets')).toBeInTheDocument()
      expect(screen.getByText('Total Cards')).toBeInTheDocument()
      // "Familiar" and "Unfamiliar" appear both in stat cards and the bar legend,
      // so use getAllByText.
      expect(screen.getAllByText('Familiar').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Neutral').length).toBeGreaterThan(0)
      expect(screen.getAllByText('Unfamiliar').length).toBeGreaterThan(0)
    })
  })

  it('renders familiarity stat cards as links to /words with correct filter params', async () => {
    renderDashboard(makeStats())

    await waitFor(() => {
      const familiarLinks = screen.getAllByRole('link', { name: /familiar/i })
      const neutralLinks = screen.getAllByRole('link', { name: /neutral/i })
      const unfamiliarLinks = screen.getAllByRole('link', { name: /unfamiliar/i })

      expect(familiarLinks[0]).toHaveAttribute('href', '/words?filter=familiar')
      expect(neutralLinks[0]).toHaveAttribute('href', '/words?filter=neutral')
      expect(unfamiliarLinks[0]).toHaveAttribute('href', '/words?filter=unfamiliar')
    })
  })
})

describe('Dashboard — familiarity bar', () => {
  afterEach(() => {
    mockApiFetch.mockReset()
  })

  it('renders the familiarity bar container when stats are loaded and total > 0', async () => {
    renderDashboard(makeStats())

    await waitFor(() => {
      expect(screen.getByText('Total Sets')).toBeInTheDocument()
    })

    const barContainer = document.querySelector('.progress-bar')
    expect(barContainer).toBeInTheDocument()
  })

  it('renders familiarity bar legend with Familiar, Neutral, and Unfamiliar labels', async () => {
    renderDashboard(makeStats())

    await waitFor(() => {
      // "Familiar" appears twice: stat card + legend. At least 2.
      expect(screen.getAllByText('Familiar').length).toBeGreaterThanOrEqual(2)
      expect(screen.getAllByText('Neutral').length).toBeGreaterThanOrEqual(1)
      // "Unfamiliar" appears twice: stat card + legend.
      expect(screen.getAllByText('Unfamiliar').length).toBeGreaterThanOrEqual(2)
    })
  })

  it('does not render the familiarity bar when total words is zero', async () => {
    renderDashboard(makeStats({
      familiarity: { familiar: 0, neutral: 0, unfamiliar: 0 },
    }))

    await waitFor(() => {
      expect(screen.getByText('Total Sets')).toBeInTheDocument()
    })

    const barContainer = document.querySelector('.progress-bar')
    expect(barContainer).not.toBeInTheDocument()
  })
})

describe('Dashboard — trouble words table', () => {
  afterEach(() => {
    mockApiFetch.mockReset()
  })

  it('renders the trouble words table when trouble words are present', async () => {
    renderDashboard(makeStats({
      troubleWords: [
        { front: '안녕하세요', back: 'Halo', incorrect_count: 5, correct_count: 2 },
        { front: '감사합니다', back: 'Terima kasih', incorrect_count: 3, correct_count: 1 },
      ],
    }))

    await waitFor(() => {
      // The heading is "🔥 Trouble Words" — use a regex that matches the text content.
      expect(screen.getByText(/trouble words/i)).toBeInTheDocument()
    })

    // Table headers.
    expect(screen.getByText('Korean')).toBeInTheDocument()
    expect(screen.getByText('Indonesian')).toBeInTheDocument()
    expect(screen.getByText('Incorrect')).toBeInTheDocument()
    expect(screen.getByText('Correct')).toBeInTheDocument()

    // Row content — use querySelector to be specific to the table body,
    // avoiding ambiguity with stat card values.
    const rows = document.querySelectorAll('.preview-table tbody tr')
    expect(rows.length).toBe(2)

    const [row1, row2] = rows
    expect(row1.querySelector('td:nth-child(2)')).toHaveTextContent('안녕하세요')
    expect(row1.querySelector('td:nth-child(3)')).toHaveTextContent('Halo')
    expect(row1.querySelector('td:nth-child(4)')).toHaveTextContent('5')
    expect(row1.querySelector('td:nth-child(5)')).toHaveTextContent('2')

    expect(row2.querySelector('td:nth-child(2)')).toHaveTextContent('감사합니다')
    expect(row2.querySelector('td:nth-child(3)')).toHaveTextContent('Terima kasih')
    expect(row2.querySelector('td:nth-child(4)')).toHaveTextContent('3')
    expect(row2.querySelector('td:nth-child(5)')).toHaveTextContent('1')
  })

  it('shows empty state when there are no trouble words (section not rendered)', async () => {
    renderDashboard(makeStats({ troubleWords: [] }))

    await waitFor(() => {
      expect(screen.getByText('Total Sets')).toBeInTheDocument()
    })

    // The "Trouble Words" section is conditionally rendered only when
    // stats.troubleWords.length > 0, so it should not appear when empty.
    expect(screen.queryByText(/trouble words/i)).not.toBeInTheDocument()
  })

  it('renders row index numbers starting from 1', async () => {
    renderDashboard(makeStats({
      troubleWords: [
        { front: 'word1', back: 'def1', incorrect_count: 10, correct_count: 1 },
        { front: 'word2', back: 'def2', incorrect_count: 8, correct_count: 2 },
      ],
    }))

    await waitFor(() => {
      expect(screen.getByText(/trouble words/i)).toBeInTheDocument()
    })

    const firstColumnCells = document.querySelectorAll('.preview-table tbody tr td:first-child')
    expect(firstColumnCells[0]).toHaveTextContent('1')
    expect(firstColumnCells[1]).toBeInTheDocument() // row 2 present
  })

  it('renders trouble words in a table with no per-row navigation links', async () => {
    renderDashboard(makeStats({
      troubleWords: [{ front: '연습', back: 'Latihan', incorrect_count: 4, correct_count: 1 }],
    }))

    await waitFor(() => {
      expect(screen.getByText('연습')).toBeInTheDocument()
    })

    // No anchor tags inside the table body — trouble words are plain text.
    const tableLinks = document.querySelectorAll('.preview-table tbody a')
    expect(tableLinks).toHaveLength(0)
  })
})

describe('Dashboard — Quick Actions', () => {
  afterEach(() => {
    mockApiFetch.mockReset()
  })

  it('renders Manage Sets, Review Now, and Take Quiz quick action cards', async () => {
    renderDashboard(makeStats())

    await waitFor(() => {
      expect(screen.getByText('Manage Sets')).toBeInTheDocument()
      expect(screen.getByText('Review Now')).toBeInTheDocument()
      expect(screen.getByText('Take Quiz')).toBeInTheDocument()
    })
  })

  it('Quick Action cards link to the correct routes', async () => {
    renderDashboard(makeStats())

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /manage sets/i })).toHaveAttribute('href', '/manage')
      expect(screen.getByRole('link', { name: /review now/i })).toHaveAttribute('href', '/review')
      expect(screen.getByRole('link', { name: /take quiz/i })).toHaveAttribute('href', '/quiz')
    })
  })
})
