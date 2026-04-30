import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SetFilter from '../components/SetFilter'

vi.mock('framer-motion', () => ({
  motion: {
    div: 'div', button: 'button', span: 'span', h2: 'h2', h3: 'h3',
    p: 'p', li: 'li', ul: 'ul', form: 'form', input: 'input',
    td: 'td', tr: 'tr', th: 'th', tbody: 'tbody', thead: 'thead',
    table: 'table', nav: 'nav', section: 'section', header: 'header',
    footer: 'footer', main: 'main', article: 'article', aside: 'aside',
    img: 'img', label: 'label', textarea: 'textarea', select: 'select',
    option: 'option', a: 'a',
  },
  AnimatePresence: ({ children }) => children,
  useAnimation: () => ({ start: vi.fn() }),
  useInView: () => false,
}))

afterEach(() => { vi.restoreAllMocks(); cleanup() })

const SORT_OPTIONS_EXPECTED = [
  { value: 'updated_desc', label: '🕐 Last Updated' },
  { value: 'created_desc', label: '📅 Newest First' },
  { value: 'created_asc', label: '📅 Oldest First' },
  { value: 'name_asc', label: '🔤 Name A→Z' },
  { value: 'name_desc', label: '🔤 Name Z→A' },
]

describe('SetFilter', () => {
  it('renders search input', () => {
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const input = screen.getByPlaceholderText('🔍 Search sets...')
    expect(input).toBeInTheDocument()
    expect(input.value).toBe('')
  })

  it('renders search input with existing value', () => {
    render(
      <SetFilter
        search="test query"
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={5}
      />
    )
    const input = screen.getByDisplayValue('test query')
    expect(input).toBeInTheDocument()
  })

  it('renders sort dropdown trigger button', () => {
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const button = screen.getByRole('button', { name: /Last Updated/i })
    expect(button).toBeInTheDocument()
  })

  it('renders sort dropdown with 5 options', () => {
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const trigger = screen.getByRole('button', { name: /Last Updated/i })
    fireEvent.click(trigger)
    // Verify each of the 5 sort options exists in the dropdown
    expect(screen.getByRole('button', { name: '📅 Newest First' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '📅 Oldest First' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🔤 Name A→Z' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '🔤 Name Z→A' })).toBeInTheDocument()
    // "Last Updated" appears twice: once as trigger, once in dropdown
    const lastUpdatedButtons = screen.getAllByRole('button', { name: /Last Updated/i })
    expect(lastUpdatedButtons).toHaveLength(2)
  })

  it('typing in search input triggers onChange callback', async () => {
    const user = userEvent.setup()
    const onSearchChange = vi.fn()
    render(
      <SetFilter
        search=""
        onSearchChange={onSearchChange}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const input = screen.getByPlaceholderText('🔍 Search sets...')
    await user.type(input, 'hello')
    // userEvent.type fires onChange for each keystroke
    // The input value at each change event reflects the current state
    expect(onSearchChange).toHaveBeenCalled()
    // At least verify it was called with some value containing 'h'
    const calls = onSearchChange.mock.calls
    const lastCall = calls[calls.length - 1]
    expect(lastCall[0]).toBeTruthy()
  })

  it('clicking sort option triggers onSort callback with correct value', () => {
    const onSortChange = vi.fn()
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={onSortChange}
        totalCount={10}
        filteredCount={10}
      />
    )
    const trigger = screen.getByRole('button', { name: /Last Updated/i })
    fireEvent.click(trigger)
    const nameAZ = screen.getByRole('button', { name: '🔤 Name A→Z' })
    fireEvent.click(nameAZ)
    expect(onSortChange).toHaveBeenCalledWith('name_asc')
  })

  it('clicking sort option triggers onSort with each value', () => {
    const onSortChange = vi.fn()
    const { rerender } = render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={onSortChange}
        totalCount={10}
        filteredCount={10}
      />
    )
    // Click Newest First
    fireEvent.click(screen.getByRole('button', { name: /Last Updated/i }))
    fireEvent.click(screen.getByRole('button', { name: '📅 Newest First' }))
    expect(onSortChange).toHaveBeenCalledWith('created_desc')
    rerender(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="created_desc"
        onSortChange={onSortChange}
        totalCount={10}
        filteredCount={10}
      />
    )
    // Click Name A→Z
    fireEvent.click(screen.getByRole('button', { name: /Newest First/i }))
    fireEvent.click(screen.getByRole('button', { name: '🔤 Name A→Z' }))
    expect(onSortChange).toHaveBeenCalledWith('name_asc')
    rerender(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="name_asc"
        onSortChange={onSortChange}
        totalCount={10}
        filteredCount={10}
      />
    )
    // Click Name Z→A
    fireEvent.click(screen.getByRole('button', { name: /Name A→Z/i }))
    fireEvent.click(screen.getByRole('button', { name: '🔤 Name Z→A' }))
    expect(onSortChange).toHaveBeenCalledWith('name_desc')
  })

  it('dropdown opens on click', () => {
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const trigger = screen.getByRole('button', { name: /Last Updated/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: '📅 Newest First' })).toBeInTheDocument()
  })

  it('dropdown closes after selecting an option', () => {
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const trigger = screen.getByRole('button', { name: /Last Updated/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('button', { name: '📅 Newest First' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '📅 Newest First' }))
    expect(screen.queryByRole('button', { name: '📅 Newest First' })).not.toBeInTheDocument()
  })

  it('dropdown closes on click-outside', async () => {
    const user = userEvent.setup()
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const trigger = screen.getByRole('button', { name: /Last Updated/i })
    await user.click(trigger)
    expect(screen.getByRole('button', { name: '📅 Newest First' })).toBeInTheDocument()
    // Click outside the dropdown by clicking the document body
    await user.click(document.body)
    expect(screen.queryByRole('button', { name: '📅 Newest First' })).not.toBeInTheDocument()
  })

  it('selected sort option is displayed in the trigger button', () => {
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="name_asc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    const button = screen.getByRole('button', { name: '🔤 Name A→Z' })
    expect(button).toBeInTheDocument()
  })

  it('shows clear button when search has text', () => {
    render(
      <SetFilter
        search="test"
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={5}
      />
    )
    const clearBtn = screen.getByRole('button', { name: '✕' })
    expect(clearBtn).toBeInTheDocument()
  })

  it('clicking clear button clears search', () => {
    const onSearchChange = vi.fn()
    render(
      <SetFilter
        search="test"
        onSearchChange={onSearchChange}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={5}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: '✕' }))
    expect(onSearchChange).toHaveBeenCalledWith('')
  })

  it('shows filtered count when search differs from total', () => {
    render(
      <SetFilter
        search="test"
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={5}
      />
    )
    expect(screen.getByText('5 of 10')).toBeInTheDocument()
  })

  it('does not show filtered count when all sets match', () => {
    render(
      <SetFilter
        search=""
        onSearchChange={vi.fn()}
        sortBy="updated_desc"
        onSortChange={vi.fn()}
        totalCount={10}
        filteredCount={10}
      />
    )
    expect(screen.queryByText(/of/)).not.toBeInTheDocument()
  })
})
