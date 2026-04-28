import { Routes, Route, NavLink } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import { lazy, Suspense } from 'react'
import LoginPage from './pages/LoginPage'
import { KoreanFlag, IndonesianFlag } from './components/Flag'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const CreateSet = lazy(() => import('./pages/CreateSet'))
const ReviewMode = lazy(() => import('./pages/ReviewMode'))
const SpellingQuiz = lazy(() => import('./pages/SpellingQuiz'))
const EditSet = lazy(() => import('./pages/EditSet'))
const WordBrowser = lazy(() => import('./pages/WordBrowser'))
const ProfilePage = lazy(() => import('./pages/ProfilePage'))

function PageLoader() {
  return (
    <div className="glass-card-strong" style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 20, margin: 48, borderRadius: 20,
    }}>
      <div style={{ display: 'flex', gap: 8, fontSize: '2rem' }}>
        <KoreanFlag size={32} /><IndonesianFlag size={32} />
      </div>
      <div style={{ color: 'var(--text-secondary)', fontWeight: 600, fontSize: '0.95rem' }}>Loading...</div>
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{ display: 'flex', gap: 8, fontSize: '2rem' }}>
          <KoreanFlag size={32} /><IndonesianFlag size={32} />
        </div>
        <div style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Loading...</div>
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="nav-bar">
        <NavLink to="/" className="nav-logo" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <KoreanFlag size={20} /> KoreaQuiz <IndonesianFlag size={20} />
        </NavLink>
        <div className="nav-links">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Dashboard
          </NavLink>
          <NavLink to="/create" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            Add Set
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
      </nav>

      <div style={{ flex: 1 }}>
        <AnimatePresence mode="wait">
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/create" element={<CreateSet />} />
              <Route path="/edit/:id" element={<EditSet />} />
              <Route path="/review" element={<ReviewMode />} />
              <Route path="/quiz" element={<SpellingQuiz />} />
              <Route path="/words" element={<WordBrowser />} />
              <Route path="/profile" element={<ProfilePage />} />
            </Routes>
          </Suspense>
        </AnimatePresence>
      </div>
    </div>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
