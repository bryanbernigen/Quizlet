import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { KoreanFlag, IndonesianFlag } from '../components/Flag'

// Mock country-flag-icons
vi.mock('country-flag-icons/react/3x2', () => ({
  KR: ({ width, height }) => <svg width={width} height={height} data-testid="korean-flag" />,
  ID: ({ width, height }) => <svg width={width} height={height} data-testid="indonesian-flag" />,
}))

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

describe('Flag', () => {
  describe('KoreanFlag', () => {
    it('renders without crashing', () => {
      const { container } = render(<KoreanFlag />)
      expect(container.firstChild).toBeTruthy()
    })

    it('renders an svg element', () => {
      render(<KoreanFlag />)
      expect(screen.getByTestId('korean-flag')).toBeInTheDocument()
    })

    it('uses default size when prop is not provided', () => {
      const { container } = render(<KoreanFlag />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      expect(width).toBe(20)
    })

    it('applies custom size prop', () => {
      const { container } = render(<KoreanFlag size={40} />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      expect(width).toBe(40)
    })

    it('applies size of 50', () => {
      const { container } = render(<KoreanFlag size={50} />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      expect(width).toBe(50)
    })

    it('height is proportional to size (2/3 ratio)', () => {
      const { container } = render(<KoreanFlag size={30} />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      const height = parseInt(el.getAttribute('height') || el.getAttribute('data-height') || '0')
      expect(width).toBe(30)
      expect(height).toBe(20)
    })
  })

  describe('IndonesianFlag', () => {
    it('renders without crashing', () => {
      const { container } = render(<IndonesianFlag />)
      expect(container.firstChild).toBeTruthy()
    })

    it('renders an svg element', () => {
      render(<IndonesianFlag />)
      expect(screen.getByTestId('indonesian-flag')).toBeInTheDocument()
    })

    it('uses default size when prop is not provided', () => {
      const { container } = render(<IndonesianFlag />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      expect(width).toBe(20)
    })

    it('applies custom size prop', () => {
      const { container } = render(<IndonesianFlag size={60} />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      expect(width).toBe(60)
    })

    it('applies size of 15', () => {
      const { container } = render(<IndonesianFlag size={15} />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      expect(width).toBe(15)
    })

    it('height is proportional to size (2/3 ratio)', () => {
      const { container } = render(<IndonesianFlag size={30} />)
      const el = container.firstChild
      const width = parseInt(el.getAttribute('width') || el.getAttribute('data-width') || '0')
      const height = parseInt(el.getAttribute('height') || el.getAttribute('data-height') || '0')
      expect(width).toBe(30)
      expect(height).toBe(20)
    })
  })

  describe('both flags together', () => {
    it('both flags render without crashing when rendered together', () => {
      const { container } = render(
        <>
          <KoreanFlag />
          <IndonesianFlag />
        </>
      )
      expect(container.querySelectorAll('*').length).toBeGreaterThan(0)
    })

    it('different sizes can be applied to each flag independently', () => {
      const { container: c1 } = render(<KoreanFlag size={32} />)
      const { container: c2 } = render(<IndonesianFlag size={48} />)
      const el1 = c1.firstChild
      const el2 = c2.firstChild
      const w1 = parseInt(el1.getAttribute('width') || el1.getAttribute('data-width') || '0')
      const w2 = parseInt(el2.getAttribute('width') || el2.getAttribute('data-width') || '0')
      expect(w1).toBe(32)
      expect(w2).toBe(48)
    })
  })
})
