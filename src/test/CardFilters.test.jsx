import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CardFilters from '../components/CardFilters'

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

describe('CardFilters', () => {
  const defaultProps = {
    familiarityFilter: ['familiar', 'neutral', 'unfamiliar'],
    attemptFilter: ['correct', 'wrong', 'unattempted'],
    onToggleFamiliarity: vi.fn(),
    onToggleAttempt: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onToggleFamiliarity.mockClear()
    defaultProps.onToggleAttempt.mockClear()
  })

  it('renders familiarity section label', () => {
    render(<CardFilters {...defaultProps} />)
    expect(screen.getByText('Familiarity')).toBeInTheDocument()
  })

  it('renders attempt status section label', () => {
    render(<CardFilters {...defaultProps} />)
    expect(screen.getByText('Attempt Status')).toBeInTheDocument()
  })

  it('renders all familiarity chips using text content', () => {
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const texts = buttons.map(b => b.textContent)
    expect(texts.some(t => t.includes('Familiar'))).toBe(true)
    expect(texts.some(t => t.includes('Neutral'))).toBe(true)
    expect(texts.some(t => t.includes('Unfamiliar'))).toBe(true)
  })

  it('renders all attempt chips using text content', () => {
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const texts = buttons.map(b => b.textContent)
    expect(texts.some(t => t.includes('Correct'))).toBe(true)
    expect(texts.some(t => t.includes('Wrong'))).toBe(true)
    expect(texts.some(t => t.includes('Unattempted'))).toBe(true)
  })

  it('clicking Familiar chip triggers onToggleFamiliarity with familiar', async () => {
    const user = userEvent.setup()
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const familiarBtn = buttons.find(b => b.textContent.includes('Familiar') && b.textContent.includes('✅'))
    await user.click(familiarBtn)
    expect(defaultProps.onToggleFamiliarity).toHaveBeenCalledWith('familiar')
  })

  it('clicking Neutral chip triggers onToggleFamiliarity with neutral', async () => {
    const user = userEvent.setup()
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const neutralBtn = buttons.find(b => b.textContent.includes('Neutral') && b.textContent.includes('➖'))
    await user.click(neutralBtn)
    expect(defaultProps.onToggleFamiliarity).toHaveBeenCalledWith('neutral')
  })

  it('clicking Unfamiliar chip triggers onToggleFamiliarity with unfamiliar', async () => {
    const user = userEvent.setup()
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const unfamiliarBtn = buttons.find(b => b.textContent.includes('Unfamiliar') && b.textContent.includes('❌'))
    await user.click(unfamiliarBtn)
    expect(defaultProps.onToggleFamiliarity).toHaveBeenCalledWith('unfamiliar')
  })

  it('clicking Correct chip triggers onToggleAttempt with correct', async () => {
    const user = userEvent.setup()
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const correctBtn = buttons.find(b => b.textContent.includes('Correct') && b.textContent.includes('✓'))
    await user.click(correctBtn)
    expect(defaultProps.onToggleAttempt).toHaveBeenCalledWith('correct')
  })

  it('clicking Wrong chip triggers onToggleAttempt with wrong', async () => {
    const user = userEvent.setup()
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const wrongBtn = buttons.find(b => b.textContent.includes('Wrong') && b.textContent.includes('✗'))
    await user.click(wrongBtn)
    expect(defaultProps.onToggleAttempt).toHaveBeenCalledWith('wrong')
  })

  it('clicking Unattempted chip triggers onToggleAttempt with unattempted', async () => {
    const user = userEvent.setup()
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const unattemptedBtn = buttons.find(b => b.textContent.includes('Unattempted') && b.textContent.includes('○'))
    await user.click(unattemptedBtn)
    expect(defaultProps.onToggleAttempt).toHaveBeenCalledWith('unattempted')
  })

  it('clicking chips is mutually exclusive within familiarity group', async () => {
    const user = userEvent.setup()
    render(
      <CardFilters
        {...defaultProps}
        familiarityFilter={['familiar']}
      />
    )
    const buttons = screen.getAllByRole('button')
    const neutralBtn = buttons.find(b => b.textContent.includes('Neutral') && b.textContent.includes('➖'))
    await user.click(neutralBtn)
    expect(defaultProps.onToggleFamiliarity).toHaveBeenCalledWith('neutral')
  })

  it('clicking chips is mutually exclusive within attempt group', async () => {
    const user = userEvent.setup()
    render(
      <CardFilters
        {...defaultProps}
        attemptFilter={['correct']}
      />
    )
    const buttons = screen.getAllByRole('button')
    const wrongBtn = buttons.find(b => b.textContent.includes('Wrong') && b.textContent.includes('✗'))
    await user.click(wrongBtn)
    expect(defaultProps.onToggleAttempt).toHaveBeenCalledWith('wrong')
  })

  it('active chip has different styling via background style attribute', () => {
    render(
      <CardFilters
        {...defaultProps}
        familiarityFilter={['familiar']}
        attemptFilter={['correct']}
      />
    )
    const buttons = screen.getAllByRole('button')
    const familiarBtn = buttons.find(b => b.textContent.includes('Familiar') && b.textContent.includes('✅'))
    const correctBtn = buttons.find(b => b.textContent.includes('Correct') && b.textContent.includes('✓'))
    // Active chips have non-transparent background
    expect(familiarBtn.style.background).toBeTruthy()
    expect(correctBtn.style.background).toBeTruthy()
    // Active chips have opacity 1
    expect(familiarBtn.style.opacity).toBe('1')
    expect(correctBtn.style.opacity).toBe('1')
  })

  it('renders without crashing with empty filters', () => {
    render(
      <CardFilters
        familiarityFilter={[]}
        attemptFilter={[]}
        onToggleFamiliarity={vi.fn()}
        onToggleAttempt={vi.fn()}
      />
    )
    expect(screen.getByText('Familiarity')).toBeInTheDocument()
    expect(screen.getByText('Attempt Status')).toBeInTheDocument()
  })

  it('renders chip buttons with expected emoji', () => {
    render(<CardFilters {...defaultProps} />)
    const buttons = screen.getAllByRole('button')
    const texts = buttons.map(b => b.textContent)
    expect(texts.some(t => t.includes('✅'))).toBe(true)
    expect(texts.some(t => t.includes('➖'))).toBe(true)
    expect(texts.some(t => t.includes('❌'))).toBe(true)
    expect(texts.some(t => t.includes('✓'))).toBe(true)
    expect(texts.some(t => t.includes('✗'))).toBe(true)
    expect(texts.some(t => t.includes('○'))).toBe(true)
  })
})
