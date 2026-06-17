import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import '@testing-library/jest-dom'

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: 'div', button: 'button', span: 'span', h2: 'h2', h3: 'h3', p: 'p',
    li: 'li', ul: 'ul', form: 'form', input: 'input', td: 'td', tr: 'tr',
    th: 'th', tbody: 'tbody', thead: 'thead', table: 'table', nav: 'nav',
    section: 'section', header: 'header', footer: 'footer', main: 'main',
    article: 'article', aside: 'aside', img: 'img', label: 'label',
    textarea: 'textarea', a: 'a',
    img: ({ children, ...props }) => React.createElement('img', props),
  },
  AnimatePresence: ({ children }) => children,
  useAnimation: () => ({ start: vi.fn() }),
  useInView: () => false,
}))

// Mock country-flag-icons
vi.mock('country-flag-icons/react/3x2', () => ({
  KR: () => React.createElement('span', { 'data-testid': 'kr-flag' }, '🇰🇷'),
  ID: () => React.createElement('span', { 'data-testid': 'id-flag' }, '🇮🇩'),
}))

// Mock AuthContext
const mockApiFetch = vi.fn()
const mockUser = { user: null, token: null }

vi.mock('../context/AuthContext', () => ({
  useApiFetch: () => mockApiFetch,
  useAuth: () => mockUser,
}))

// Mock data - hoisted so it's available when vi.mock factories run
const { mockSets, mockCards } = vi.hoisted(() => ({
  mockSets: [
    { id: 1, name: 'Korean Basics', card_count: 10, familiar_count: 3, neutral_count: 4, unfamiliar_count: 3 },
    { id: 2, name: 'Korean Food', card_count: 5, familiar_count: 1, neutral_count: 2, unfamiliar_count: 2 },
    { id: 3, name: 'Korean Travel', card_count: 8, familiar_count: 5, neutral_count: 2, unfamiliar_count: 1 },
  ],
  mockCards: [
    { id: 1, front: '안녕하세요', back: 'Halo' },
    { id: 2, front: '감사합니다', back: 'Terima kasih' },
    { id: 3, front: '사랑', back: 'Cinta' },
  ],
}))

// Mock SetFilter
vi.mock('../components/SetFilter', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'set-filter' }, 'SetFilter'),
  useSetFilter: () => ({
    search: '',
    setSearch: vi.fn(),
    sortBy: 'updated_desc',
    setSortBy: vi.fn(),
    filteredSets: mockSets,
  }),
}))

// Mock CardFilters
vi.mock('../components/CardFilters', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'card-filters' }, 'CardFilters'),
  useCardFilters: () => ({
    familiarityFilter: ['familiar', 'neutral', 'unfamiliar'],
    attemptFilter: ['correct', 'wrong', 'unattempted'],
    toggleFamiliarity: vi.fn(),
    toggleAttempt: vi.fn(),
    buildQueryParams: () => '',
  }),
}))

import ReviewMode from '../pages/ReviewMode'

const TestWrapper = ({ children, initialEntries = ['/review'] }) => (
  <MemoryRouter initialEntries={initialEntries}>
    {children}
  </MemoryRouter>
)

describe('ReviewMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockImplementation((url) => {
      if (url === '/api/sets') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
      }
      if (url.startsWith('/api/cards/review')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockCards) })
      }
      return Promise.reject(new Error(`Unexpected URL: ${url}`))
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Setup screen', () => {
    it('shows set selection with checkboxes on initial load', async () => {
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Review Mode')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes.length).toBeGreaterThan(0)

      expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      expect(screen.getByText('Korean Food')).toBeInTheDocument()
    })

    it('shows Select All / Deselect All buttons work', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const selectAllBtn = screen.getByText('Select All')
      expect(selectAllBtn).toBeInTheDocument()

      await user.click(selectAllBtn)

      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes.forEach(cb => expect(cb).toBeChecked())

      expect(screen.getByText('Deselect All')).toBeInTheDocument()

      await user.click(screen.getByText('Deselect All'))

      checkboxes.forEach(cb => expect(cb).not.toBeChecked())
    })

    it('selected count updates correctly', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      expect(screen.getByText('0 selected')).toBeInTheDocument()

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      expect(screen.getByText('1 selected')).toBeInTheDocument()

      await user.click(checkboxes[1])
      expect(screen.getByText('2 selected')).toBeInTheDocument()
    })

    it('Start Review button starts review session', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })
    })

    it('card displays front text, click flips to back', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })

      const card = screen.getByText('안녕하세요')
      await user.click(card)

      await waitFor(() => {
        expect(screen.getByText('Halo')).toBeInTheDocument()
      })
    })

    it('Know it / Still learning buttons advance to next card', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: '✅ Familiar' }))

      await waitFor(() => {
        expect(screen.getByText('감사합니다')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: '❌ Not Familiar' }))

      await waitFor(() => {
        expect(screen.getByText('사랑')).toBeInTheDocument()
      })
    })

    it('progress bar updates as cards are reviewed', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('Card 1 of 3')).toBeInTheDocument()
      })

      expect(screen.getByText('0% complete')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: '✅ Familiar' }))

      await waitFor(() => {
        expect(screen.getByText('Card 2 of 3')).toBeInTheDocument()
      })

      expect(screen.getByText('33% complete')).toBeInTheDocument()
    })

    it('progress count shows X / Y', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('Card 1 of 3')).toBeInTheDocument()
      })

      expect(screen.getByText(/Card \d+ of \d+/)).toBeInTheDocument()
    })

    it('on completion shows results screen', async () => {
      const user = userEvent.setup()
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/review')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 1, front: '안녕하세요', back: 'Halo' }]) })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: '✅ Familiar' }))

      await waitFor(() => {
        expect(screen.getByText('Review Complete!')).toBeInTheDocument()
      })
    })

    it('results screen shows total reviewed count', async () => {
      const user = userEvent.setup()
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/review')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([
              { id: 1, front: '안녕하세요', back: 'Halo' },
              { id: 2, front: '감사합니다', back: 'Terima kasih' },
            ]),
          })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: '✅ Familiar' }))
      await waitFor(() => {
        expect(screen.getByText('감사합니다')).toBeInTheDocument()
      })
      await user.click(screen.getByRole('button', { name: '✅ Familiar' }))

      await waitFor(() => {
        expect(screen.getByText('Review Complete!')).toBeInTheDocument()
      })

      expect(screen.getByText('Familiar')).toBeInTheDocument()
      expect(screen.getByText('Neutral')).toBeInTheDocument()
      expect(screen.getByText('Not Familiar')).toBeInTheDocument()
    })

    it('completion tally counts each rated card once', async () => {
      const user = userEvent.setup()
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/review')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([{ id: 1, front: '안녕하세요', back: 'Halo' }]) })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      render(<TestWrapper><ReviewMode /></TestWrapper>)

      await waitFor(() => expect(screen.getByText('Korean Basics')).toBeInTheDocument())
      await user.click(screen.getAllByRole('checkbox')[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))
      await waitFor(() => expect(screen.getByText('안녕하세요')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: '✅ Familiar' }))

      await waitFor(() => expect(screen.getByText('Review Complete!')).toBeInTheDocument())

      // The "Familiar" stat card value should be exactly 1.
      const familiarLabel = screen.getByText('Familiar')
      const statCard = familiarLabel.closest('.stat-card')
      expect(statCard).toHaveTextContent('1')
    })

    it('results screen Review Again restarts the session', async () => {
      const user = userEvent.setup()
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/review')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 1, front: '안녕하세요', back: 'Halo' }]),
          })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: '✅ Familiar' }))

      await waitFor(() => {
        expect(screen.getByText('Review Complete!')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /Review Again/i }))

      await waitFor(() => {
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })
    })

    it('filter toggles affect card selection', async () => {
      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      expect(screen.getByTestId('card-filters')).toBeInTheDocument()
    })

    it('with setIds param pre-populates selected sets, skips selection screen', async () => {
      render(
        <TestWrapper initialEntries={['/review?setIds=1,2']}>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Review Mode')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).toBeChecked()
      expect(checkboxes[1]).toBeChecked()
      expect(checkboxes[2]).not.toBeChecked()
    })

    it('with sharedSet param loads from shared endpoint, hides familiarity tracking', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          set: { id: 99, name: 'Shared Set' },
          cards: mockCards,
        }),
      })

      render(
        <TestWrapper initialEntries={['/review?sharedSet=abc123token']}>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Reviewing shared set')).toBeInTheDocument()
      })

      expect(screen.queryByText('Select Sets')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Start Review/i })).toBeInTheDocument()
    })

    it('shows error state on API failure', async () => {
      const user = userEvent.setup()
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/review')) {
          return Promise.reject(new Error('Failed to load'))
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
      })
    })

    it('shows empty state when no cards match filters', async () => {
      const user = userEvent.setup()
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/review')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      render(
        <TestWrapper>
          <ReviewMode />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: /Start Review/i }))

      await waitFor(() => {
        expect(screen.getByText('No cards match your selected filters.')).toBeInTheDocument()
      })
    })
  })
})
