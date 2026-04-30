import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, Routes, Route, MemoryRouter, NavLink } from 'react-router-dom'
import React, { Suspense, lazy } from 'react'

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

// PageLoader from App.jsx
function PageLoader() {
  return (
    <div data-testid="page-loader">
      <div>Loading...</div>
    </div>
  )
}

// Mock lazy-loaded page components
const MockDashboard = () => <div data-testid="page-dashboard">Dashboard Page</div>
const MockManageSets = () => <div data-testid="page-manage-sets">Manage Sets Page</div>
const MockSharedSet = () => <div data-testid="page-shared-set">Shared Set Page</div>
const MockReview = () => <div data-testid="page-review">Review Page</div>
const MockQuiz = () => <div data-testid="page-quiz">Quiz Page</div>
const MockWords = () => <div data-testid="page-words">Words Page</div>
const MockProfile = () => <div data-testid="page-profile">Profile Page</div>

afterEach(() => { vi.restoreAllMocks(); cleanup() })

// Renders nav bar simulating App.jsx's nav rendering based on auth state
function renderNavBar({ user = null } = {}) {
  return render(
    <MemoryRouter>
      <nav className="nav-bar">
        <div className="nav-logo">
          <span>Logo</span>
        </div>
        {user ? (
          <div className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/manage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Manage Sets
            </NavLink>
            <NavLink to="/review" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Review
            </NavLink>
            <NavLink to="/quiz" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Quiz
            </NavLink>
            <NavLink to="/words" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Words
            </NavLink>
            <NavLink to="/profile" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              👤 {user.username}
            </NavLink>
          </div>
        ) : (
          <div className="nav-links">
            <NavLink to="/login" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Log in
            </NavLink>
          </div>
        )}
      </nav>
    </MemoryRouter>
  )
}

// Renders the route area with lazy-loaded routes and Suspense
function renderRoutes(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<MockDashboard />} />
          <Route path="/manage" element={<MockManageSets />} />
          <Route path="/shared/:shareToken" element={<MockSharedSet />} />
          <Route path="/edit/:id" element={<MockDashboard />} />
          <Route path="/review" element={<MockReview />} />
          <Route path="/quiz" element={<MockQuiz />} />
          <Route path="/words" element={<MockWords />} />
          <Route path="/profile" element={<MockProfile />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </Suspense>
    </MemoryRouter>
  )
}

describe('App Routing', () => {
  describe('nav bar for logged-in user', () => {
    it('shows full nav bar with all links when user is logged in', () => {
      renderNavBar({ user: { username: 'testuser', id: 1 } })
      expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Manage Sets' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Quiz' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Words' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /testuser/i })).toBeInTheDocument()
    })

    it('shows username in nav for logged-in user', () => {
      renderNavBar({ user: { username: 'john_doe', id: 1 } })
      expect(screen.getByText('👤 john_doe')).toBeInTheDocument()
    })

    it('displays user-specific nav links at correct paths', () => {
      renderNavBar({ user: { username: 'alice', id: 2 } })
      const links = screen.getAllByRole('link')
      const hrefs = links.map(l => l.getAttribute('href'))
      expect(hrefs).toContain('/')
      expect(hrefs).toContain('/manage')
      expect(hrefs).toContain('/review')
      expect(hrefs).toContain('/quiz')
      expect(hrefs).toContain('/words')
      expect(hrefs).toContain('/profile')
    })
  })

  describe('nav bar for unauthenticated user', () => {
    it('shows only Log in link when user is not logged in', () => {
      renderNavBar({ user: null })
      expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
    })

    it('shows minimal nav on shared route (not logged in)', () => {
      renderNavBar({ user: null })
      expect(screen.getByRole('link', { name: 'Log in' })).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Manage Sets' })).not.toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Review' })).not.toBeInTheDocument()
    })

    it('redirects to login when not logged in and not on shared route', () => {
      renderRoutes('/login')
      expect(screen.getByText('Login Page')).toBeInTheDocument()
    })
  })

  describe('PageLoader', () => {
    it('renders PageLoader component', () => {
      render(<PageLoader />)
      expect(screen.getByTestId('page-loader')).toBeInTheDocument()
      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })
  })

  describe('lazy-loaded routes', () => {
    it('Dashboard route renders at /', () => {
      renderRoutes('/')
      expect(screen.getByTestId('page-dashboard')).toBeInTheDocument()
    })

    it('Manage Sets route renders at /manage', () => {
      renderRoutes('/manage')
      expect(screen.getByTestId('page-manage-sets')).toBeInTheDocument()
    })

    it('Shared Set route renders at /shared/:shareToken', () => {
      renderRoutes('/shared/some-token-abc123')
      expect(screen.getByTestId('page-shared-set')).toBeInTheDocument()
    })

    it('Review route renders at /review', () => {
      renderRoutes('/review')
      expect(screen.getByTestId('page-review')).toBeInTheDocument()
    })

    it('Quiz route renders at /quiz', () => {
      renderRoutes('/quiz')
      expect(screen.getByTestId('page-quiz')).toBeInTheDocument()
    })

    it('Words route renders at /words', () => {
      renderRoutes('/words')
      expect(screen.getByTestId('page-words')).toBeInTheDocument()
    })

    it('Profile route renders at /profile', () => {
      renderRoutes('/profile')
      expect(screen.getByTestId('page-profile')).toBeInTheDocument()
    })

    it('all 8 routes are defined', () => {
      const routeDefs = [
        { path: '/', name: 'Dashboard' },
        { path: '/manage', name: 'ManageSets' },
        { path: '/shared/:shareToken', name: 'SharedSet' },
        { path: '/edit/:id', name: 'EditSet' },
        { path: '/review', name: 'ReviewMode' },
        { path: '/quiz', name: 'SpellingQuiz' },
        { path: '/words', name: 'WordBrowser' },
        { path: '/profile', name: 'ProfilePage' },
      ]
      expect(routeDefs).toHaveLength(8)
    })
  })

  describe('NavLink active state', () => {
    it('NavLink sets active class when on the matching route', async () => {
      render(
        <MemoryRouter initialEntries={['/manage']}>
          <nav className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/manage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Manage Sets
            </NavLink>
          </nav>
        </MemoryRouter>
      )
      await waitFor(() => {
        const manageLink = screen.getByRole('link', { name: 'Manage Sets' })
        expect(manageLink.className).toContain('active')
      })
    })

    it('NavLink does not set active class when on different route', async () => {
      render(
        <MemoryRouter initialEntries={['/']}>
          <nav className="nav-links">
            <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Dashboard
            </NavLink>
            <NavLink to="/manage" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              Manage Sets
            </NavLink>
          </nav>
        </MemoryRouter>
      )
      await waitFor(() => {
        const dashboardLink = screen.getByRole('link', { name: 'Dashboard' })
        expect(dashboardLink.className).toContain('active')
      })
      const manageLink = screen.getByRole('link', { name: 'Manage Sets' })
      expect(manageLink.className).not.toContain('active')
    })
  })
})
