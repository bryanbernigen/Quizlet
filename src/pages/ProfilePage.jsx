import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth, useApiFetch } from '../context/AuthContext'

const pageVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } },
  exit: { opacity: 0, y: -20, transition: { duration: 0.2 } },
}

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const apiFetch = useApiFetch()
  const navigate = useNavigate()
  const [importStatus, setImportStatus] = useState(null)
  const fileInputRef = useRef(null)

  // Admin state
  const [users, setUsers] = useState(null)
  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false })
  const [userStatus, setUserStatus] = useState(null)
  const [creatingUser, setCreatingUser] = useState(false)
  const [guests, setGuests] = useState(null)
  const [settings, setSettings] = useState(null)
  const [settingsForm, setSettingsForm] = useState({ guest_ttl_minutes: '', guest_max_concurrent: '' })
  const [settingsStatus, setSettingsStatus] = useState(null)

  useEffect(() => {
    if (user?.is_admin) {
      loadUsers()
      loadGuests()
      loadSettings()
    }
  }, [user])

  const loadUsers = async () => {
    const res = await apiFetch('/api/admin/users')
    if (res.ok) setUsers(await res.json())
  }

  const loadGuests = async () => {
    const res = await apiFetch('/api/admin/guests')
    if (res.ok) setGuests(await res.json())
  }

  const loadSettings = async () => {
    const res = await apiFetch('/api/admin/settings')
    if (res.ok) {
      const s = await res.json()
      setSettings(s)
      setSettingsForm({
        guest_ttl_minutes: String(s.guest_ttl_minutes),
        guest_max_concurrent: String(s.guest_max_concurrent),
      })
    }
  }

  const handleTerminateGuest = async (guestId) => {
    const res = await apiFetch(`/api/admin/users/${guestId}`, { method: 'DELETE' })
    if (res.ok) loadGuests()
  }

  const handleSaveSettings = async (e) => {
    e.preventDefault()
    setSettingsStatus(null)
    const res = await apiFetch('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guest_ttl_minutes: Number(settingsForm.guest_ttl_minutes),
        guest_max_concurrent: Number(settingsForm.guest_max_concurrent),
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setSettings(data)
      setSettingsStatus({ type: 'success', message: '✓ Saved' })
      loadGuests()
    } else {
      setSettingsStatus({ type: 'error', message: data.error || 'Save failed' })
    }
  }

  const guestTimeLeft = (expiresAt) => {
    const norm = expiresAt.includes('T') ? expiresAt : expiresAt.replace(' ', 'T') + 'Z'
    const total = Math.max(0, Math.floor((new Date(norm).getTime() - Date.now()) / 1000))
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
  }

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const handleExport = async () => {
    const res = await apiFetch('/api/export')
    if (!res.ok) {
      const data = await res.json()
      setImportStatus({ type: 'error', message: `❌ Export failed: ${data.error || 'Unknown error'}` })
      return
    }
    const data = await res.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `koreaquiz-${user.username}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImportStatus(null)
    try {
      const text = await file.text()
      let data
      try {
        data = JSON.parse(text)
      } catch (parseErr) {
        setImportStatus({ type: 'error', message: `❌ Invalid JSON file: ${parseErr.message}` })
        e.target.value = ''
        return
      }

      const res = await apiFetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const result = await res.json()
      if (res.ok) {
        setImportStatus({
          type: 'success',
          message: `✅ ${result.setsCreated} sets created, ${result.setsUpdated} updated, ${result.cardsCreated} cards added, ${result.cardsUpdated} cards updated`
        })
      } else {
        setImportStatus({ type: 'error', message: `❌ ${result.error}` })
      }
    } catch (err) {
      setImportStatus({ type: 'error', message: `❌ Import failed: ${err.message}` })
    }
    e.target.value = ''
  }

  const handleCreateUser = async (e) => {
    e.preventDefault()
    setUserStatus(null)
    setCreatingUser(true)
    try {
      const res = await apiFetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      })
      const data = await res.json()
      if (res.ok) {
        setUserStatus({ type: 'success', message: `✅ User "${data.user.username}" created` })
        setNewUser({ username: '', password: '', is_admin: false })
        await loadUsers()
      } else {
        setUserStatus({ type: 'error', message: `❌ ${data.error}` })
      }
    } catch (err) {
      setUserStatus({ type: 'error', message: `❌ ${err.message}` })
    } finally {
      setCreatingUser(false)
    }
  }

  const handleDeleteUser = async (targetId, targetUsername) => {
    if (!window.confirm(`Delete user "${targetUsername}"? This will remove all their data.`)) return
    setUserStatus(null)
    try {
      const res = await apiFetch(`/api/admin/users/${targetId}`, { method: 'DELETE' })
      const data = await res.json()
      if (res.ok) {
        setUserStatus({ type: 'success', message: `✅ User "${targetUsername}" deleted` })
        await loadUsers()
      } else {
        setUserStatus({ type: 'error', message: `❌ ${data.error}` })
      }
    } catch (err) {
      setUserStatus({ type: 'error', message: `❌ ${err.message}` })
    }
  }

  return (
    <motion.div className="page-container" variants={pageVariants} initial="initial" animate="animate" exit="exit">
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 8 }}>
        <span className="gradient-text">Profile</span>
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginBottom: 32 }}>Account settings & data management</p>

      {/* User Info */}
      <div className="glass-card" style={{ padding: 28, marginBottom: 32, display: 'flex', alignItems: 'center', gap: 20 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--accent-purple), var(--accent-blue))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '1.5rem', fontWeight: 800, color: 'white',
        }}>
          {user?.username?.[0]?.toUpperCase() || '?'}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>
            {user?.username}
            {user?.is_admin && (
              <span style={{
                marginLeft: 8, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 8,
                background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-purple)',
                fontWeight: 700, verticalAlign: 'middle',
              }}>ADMIN</span>
            )}
          </div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: 2 }}>
            Member since {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}
          </div>
        </div>
      </div>

      {/* Data Management */}
      <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>📦 Data Management</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24, maxWidth: 420 }}>
        <motion.button
          className="glass-card-strong"
          onClick={handleExport}
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.98 }}
          style={{ padding: '24px 20px', cursor: 'pointer', textAlign: 'center', border: 'none', fontFamily: 'inherit' }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📤</div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Export</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>Download backup</div>
        </motion.button>

        <motion.button
          className="glass-card-strong"
          onClick={() => fileInputRef.current?.click()}
          whileHover={{ scale: 1.03, y: -2 }}
          whileTap={{ scale: 0.98 }}
          style={{ padding: '24px 20px', cursor: 'pointer', textAlign: 'center', border: 'none', fontFamily: 'inherit' }}
        >
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📥</div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>Import</div>
          <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', marginTop: 4 }}>Restore backup</div>
        </motion.button>
        <input ref={fileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
      </div>

      {importStatus && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            marginBottom: 24, padding: '12px 20px', borderRadius: 12,
            background: importStatus.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${importStatus.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'}`,
            color: importStatus.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
            fontSize: '0.9rem', fontWeight: 600,
          }}
        >
          {importStatus.message}
        </motion.div>
      )}

      {/* Admin: User Management */}
      {user?.is_admin && (
        <div style={{ marginTop: 40 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 16 }}>👥 User Management</h2>

          {/* Create user form */}
          <div className="glass-card" style={{ padding: 24, marginBottom: 24, maxWidth: 480 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Create New User</h3>
            <form onSubmit={handleCreateUser}>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Username</label>
                <input
                  className="form-input"
                  type="text"
                  value={newUser.username}
                  onChange={e => setNewUser(u => ({ ...u, username: e.target.value }))}
                  placeholder="At least 3 characters"
                  required
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label className="form-label">Password</label>
                <input
                  className="form-input"
                  type="password"
                  value={newUser.password}
                  onChange={e => setNewUser(u => ({ ...u, password: e.target.value }))}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="is_admin_check"
                  checked={newUser.is_admin}
                  onChange={e => setNewUser(u => ({ ...u, is_admin: e.target.checked }))}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="is_admin_check" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>
                  Grant admin privileges
                </label>
              </div>
              <motion.button
                type="submit"
                className="btn-primary"
                disabled={creatingUser}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                style={{ padding: '10px 24px', fontSize: '0.9rem', opacity: creatingUser ? 0.7 : 1 }}
              >
                {creatingUser ? '...' : '➕ Create User'}
              </motion.button>
            </form>
          </div>

          {userStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginBottom: 16, padding: '10px 16px', borderRadius: 10,
                background: userStatus.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${userStatus.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)'}`,
                color: userStatus.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
                fontSize: '0.85rem', fontWeight: 600, maxWidth: 480,
              }}
            >
              {userStatus.message}
            </motion.div>
          )}

          {/* User list */}
          {users && (
            <div style={{ maxWidth: 480 }}>
              {users.map(u => (
                <div
                  key={u.id}
                  className="glass-card"
                  style={{
                    padding: '14px 18px', marginBottom: 10,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <span style={{ fontWeight: 700 }}>{u.username}</span>
                    {u.is_admin && (
                      <span style={{
                        marginLeft: 8, fontSize: '0.7rem', padding: '2px 6px', borderRadius: 6,
                        background: 'rgba(139, 92, 246, 0.2)', color: 'var(--accent-purple)', fontWeight: 700,
                      }}>ADMIN</span>
                    )}
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginTop: 2 }}>
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  {u.id !== user.id && (
                    <motion.button
                      onClick={() => handleDeleteUser(u.id, u.username)}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      style={{
                        padding: '6px 14px', borderRadius: 8,
                        background: 'rgba(239, 68, 68, 0.1)',
                        border: '1px solid var(--accent-red)',
                        color: 'var(--accent-red)',
                        fontWeight: 600, fontSize: '0.8rem',
                        cursor: 'pointer', fontFamily: 'inherit',
                      }}
                    >
                      Delete
                    </motion.button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Guest settings */}
          <div className="glass-card" style={{ padding: 24, marginTop: 24, maxWidth: 480 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>Guest Settings</h3>
            <form onSubmit={handleSaveSettings} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label className="form-label" htmlFor="guest_ttl">Guest duration (minutes)</label>
                <input id="guest_ttl" className="form-input" type="number" min="1"
                  value={settingsForm.guest_ttl_minutes}
                  onChange={e => setSettingsForm(f => ({ ...f, guest_ttl_minutes: e.target.value }))} />
              </div>
              <div>
                <label className="form-label" htmlFor="guest_max">Max concurrent guests</label>
                <input id="guest_max" className="form-input" type="number" min="1"
                  value={settingsForm.guest_max_concurrent}
                  onChange={e => setSettingsForm(f => ({ ...f, guest_max_concurrent: e.target.value }))} />
              </div>
              <button type="submit" className="btn-primary" style={{ padding: '10px 20px' }}>Save guest settings</button>
            </form>
            {settingsStatus && (
              <div style={{ marginTop: 12, fontSize: '0.85rem', fontWeight: 600,
                color: settingsStatus.type === 'error' ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                {settingsStatus.message}
              </div>
            )}
          </div>

          {/* Active guests */}
          <div className="glass-card" style={{ padding: 24, marginTop: 24 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16 }}>
              Active Guests {guests && `(${guests.length}${settings ? ' / ' + settings.guest_max_concurrent : ''})`}
            </h3>
            {guests && guests.length === 0 && (
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>No active guests right now.</p>
            )}
            {guests && guests.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-secondary)' }}>
                      <th style={{ padding: '6px 8px' }}>Guest</th>
                      <th style={{ padding: '6px 8px' }}>Started</th>
                      <th style={{ padding: '6px 8px' }}>Time left</th>
                      <th style={{ padding: '6px 8px' }}>Sets</th>
                      <th style={{ padding: '6px 8px' }}>Cards</th>
                      <th style={{ padding: '6px 8px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {guests.map(g => (
                      <tr key={g.id} style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                        <td style={{ padding: '8px' }}>{g.username}</td>
                        <td style={{ padding: '8px' }}>{new Date(g.created_at.includes('T') ? g.created_at : g.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString()}</td>
                        <td style={{ padding: '8px' }}>{guestTimeLeft(g.expires_at)}</td>
                        <td style={{ padding: '8px' }}>{g.set_count}</td>
                        <td style={{ padding: '8px' }}>{g.card_count}</td>
                        <td style={{ padding: '8px' }}>
                          <button
                            onClick={() => handleTerminateGuest(g.id)}
                            style={{
                              padding: '4px 12px', borderRadius: 8,
                              background: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--accent-red)',
                              color: 'var(--accent-red)', fontWeight: 600, fontSize: '0.8rem',
                              cursor: 'pointer', fontFamily: 'inherit',
                            }}
                          >
                            Terminate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logout */}
      <div style={{ marginTop: 40 }}>
        <motion.button
          onClick={handleLogout}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          style={{
            padding: '12px 32px', borderRadius: 12,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--accent-red)',
            color: 'var(--accent-red)',
            fontWeight: 700, fontSize: '0.9rem',
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          🚪 Log Out
        </motion.button>
      </div>
    </motion.div>
  )
}
