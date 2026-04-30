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

// Mock data - hoisted so available when vi.mock factories run
const { mockSets, mockCards } = vi.hoisted(() => ({
  mockSets: [
    { id: 1, name: 'Korean Basics', card_count: 10, familiar_count: 3, neutral_count: 4, unfamiliar_count: 3, correct_count: 5, incorrect_count: 3, unattempted_count: 2 },
    { id: 2, name: 'Korean Food', card_count: 5, familiar_count: 1, neutral_count: 2, unfamiliar_count: 2, correct_count: 2, incorrect_count: 1, unattempted_count: 2 },
    { id: 3, name: 'Korean Travel', card_count: 8, familiar_count: 5, neutral_count: 2, unfamiliar_count: 1, correct_count: 6, incorrect_count: 2, unattempted_count: 0 },
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

import SpellingQuiz from '../pages/SpellingQuiz'

const TestWrapper = ({ children, initialEntries = ['/quiz'] }) => (
  <MemoryRouter initialEntries={initialEntries}>
    {children}
  </MemoryRouter>
)

describe('SpellingQuiz', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApiFetch.mockImplementation((url) => {
      if (url === '/api/sets') {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
      }
      if (url.startsWith('/api/cards/quiz')) {
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
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Spelling Quiz')).toBeInTheDocument()
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
          <SpellingQuiz />
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
          <SpellingQuiz />
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

    it('Start Quiz button starts quiz session', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      // With frontLang='indonesian' (default), question is the Indonesian word (back)
      await waitFor(() => {
        expect(screen.getByText('Halo')).toBeInTheDocument()
      })
    })

    it('card displays question text (frontLang=indonesian shows Indonesian word)', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      // Default frontLang='indonesian' means question shows Indonesian (c.back)
      await waitFor(() => {
        expect(screen.getByText('Halo')).toBeInTheDocument()
      })
    })

    it('text input for answer', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      expect(input).toBeInTheDocument()
      expect(input).toHaveValue('')

      await user.type(input, '안녕하세요')
      expect(input).toHaveValue('안녕하세요')
    })

    it('Enter key submits answer', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      // Correct answer: type the Korean word (front), since question shows Indonesian (back)
      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, '안녕하세요{Enter}')

      await waitFor(() => {
        expect(screen.getByText(/Correct!/)).toBeInTheDocument()
      })
    })

    it('Submit button submits answer', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, '안녕하세요')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/Correct!/)).toBeInTheDocument()
      })
    })

    it('correct answer shows success feedback', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, '안녕하세요')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/Correct!/)).toBeInTheDocument()
      })
    })

    it('incorrect answer shows error feedback with correct answer revealed', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, 'WrongAnswer')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/Incorrect/)).toBeInTheDocument()
        // Correct answer revealed: Korean word (front)
        expect(screen.getByText('안녕하세요')).toBeInTheDocument()
      })
    })

    it('score updates after each answer', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      // First question - correct
      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.clear(input)
      await user.type(input, '안녕하세요')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      // Score updated: green span with 1, red span with 0
      await waitFor(() => {
        const greenSpan = screen.getByText('1', { selector: 'span' })
        expect(greenSpan).toHaveStyle({ color: 'var(--accent-green)' })
      })

      // Continue to next
      await user.click(screen.getByRole('button', { name: /Next Question/i }))

      await waitFor(() => {
        expect(screen.getByText('Terima kasih')).toBeInTheDocument()
      })

      // Second question - incorrect
      const input2 = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.clear(input2)
      await user.type(input2, 'Wrong')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        const redSpan = screen.getAllByText('1', { selector: 'span' })[1]
        expect(redSpan).toHaveStyle({ color: 'var(--accent-red)' })
      })
    })

    it('progress advances to next card', async () => {
      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByText('Question 1 of 3')).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, '안녕하세요')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/Correct!/)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /Next Question/i }))

      await waitFor(() => {
        expect(screen.getByText('Question 2 of 3')).toBeInTheDocument()
        expect(screen.getByText('Terima kasih')).toBeInTheDocument()
      })
    })

    it('on completion shows score screen with percentage', async () => {
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/quiz')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 1, front: '안녕하세요', back: 'Halo' }]),
          })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, '안녕하세요')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/Correct!/)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /See Results/i }))

      await waitFor(() => {
        expect(screen.getByText('Quiz Complete!')).toBeInTheDocument()
      })

      expect(screen.getByText(/100%/)).toBeInTheDocument()
    })

    it('Try Again restarts the quiz', async () => {
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/quiz')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 1, front: '안녕하세요', back: 'Halo' }]),
          })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, '안녕하세요')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/Correct!/)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /See Results/i }))

      await waitFor(() => {
        expect(screen.getByText('Quiz Complete!')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /Retry Quiz/i }))

      await waitFor(() => {
        expect(screen.getByText('Halo')).toBeInTheDocument()
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })
    })

    it('Return to Dashboard navigates home', async () => {
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/quiz')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve([{ id: 1, front: '안녕하세요', back: 'Halo' }]),
          })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Type the.*translation/i)).toBeInTheDocument()
      })

      const input = screen.getByPlaceholderText(/Type the.*translation/i)
      await user.type(input, '안녕하세요')
      await user.click(screen.getByRole('button', { name: /Check Answer/i }))

      await waitFor(() => {
        expect(screen.getByText(/Correct!/)).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /See Results/i }))

      await waitFor(() => {
        expect(screen.getByText('Quiz Complete!')).toBeInTheDocument()
      })

      await user.click(screen.getByRole('button', { name: /Back to Setup/i }))

      await waitFor(() => {
        expect(screen.getByText('Spelling Quiz')).toBeInTheDocument()
        expect(screen.getByText('Select Sets')).toBeInTheDocument()
      })
    })

    it('with setIds param pre-populates selected sets, skips selection', async () => {
      render(
        <TestWrapper initialEntries={['/quiz?setIds=1,2']}>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Spelling Quiz')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      expect(checkboxes[0]).toBeChecked()
      expect(checkboxes[1]).toBeChecked()
    })

    it('with sharedSet param loads from shared endpoint, skips quiz result API calls', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          set: { id: 99, name: 'Shared Set' },
          cards: mockCards,
        }),
      })

      render(
        <TestWrapper initialEntries={['/quiz?sharedSet=abc123token']}>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Quiz from shared set')).toBeInTheDocument()
      })

      expect(screen.queryByText('Select Sets')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: '✏️ Start Quiz' })).toBeInTheDocument()
    })

    it('shows error state on API failure', async () => {
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/quiz')) {
          return Promise.reject(new Error('Failed to load'))
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByText(/Failed to load/i)).toBeInTheDocument()
      })
    })

    it('shows empty state when no cards match filters', async () => {
      mockApiFetch.mockImplementation((url) => {
        if (url === '/api/sets') {
          return Promise.resolve({ ok: true, json: () => Promise.resolve(mockSets) })
        }
        if (url.startsWith('/api/cards/quiz')) {
          return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`))
      })

      const user = userEvent.setup()
      render(
        <TestWrapper>
          <SpellingQuiz />
        </TestWrapper>
      )

      await waitFor(() => {
        expect(screen.getByText('Korean Basics')).toBeInTheDocument()
      })

      const checkboxes = screen.getAllByRole('checkbox')
      await user.click(checkboxes[0])
      await user.click(screen.getByRole('button', { name: '✏️ Start Quiz' }))

      await waitFor(() => {
        expect(screen.getByText('No cards match your selected filters.')).toBeInTheDocument()
      })
    })
  })
})
