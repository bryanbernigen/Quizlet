import { Routes, Route, NavLink } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import Dashboard from './pages/Dashboard'
import CreateSet from './pages/CreateSet'
import ReviewMode from './pages/ReviewMode'
import SpellingQuiz from './pages/SpellingQuiz'
import EditSet from './pages/EditSet'
import WordBrowser from './pages/WordBrowser'
import ProfilePage from './pages/ProfilePage'

function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}>
        <div style={{ fontSize: '2.5rem' }}>🇰🇷 🇮🇩</div>
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
        <NavLink to="/" className="nav-logo">🇰🇷 KoreaQuiz 🇮🇩</NavLink>
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
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/create" element={<CreateSet />} />
            <Route path="/edit/:id" element={<EditSet />} />
            <Route path="/review" element={<ReviewMode />} />
            <Route path="/quiz" element={<SpellingQuiz />} />
            <Route path="/words" element={<WordBrowser />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
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
