import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

export function useAuth() {
  return useContext(AuthContext)
}

export function useApiFetch() {
  const { token } = useAuth()

  return useCallback(async (url, options = {}) => {
    const headers = { ...options.headers }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    if (options.body && typeof options.body === 'string') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    }

    const res = await fetch(url, { ...options, headers })

    if (res.status === 401) {
      localStorage.removeItem('koreaquiz_token')
      window.location.reload()
      throw new Error('Session expired')
    }

    return res
  }, [token])
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('koreaquiz_token'))
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }

    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}` },
    })
      .then(r => {
        if (!r.ok) throw new Error('Invalid token')
        return r.json()
      })
      .then(userData => {
        setUser(userData)
        setLoading(false)
      })
      .catch(() => {
        localStorage.removeItem('koreaquiz_token')
        setToken(null)
        setUser(null)
        setLoading(false)
      })
  }, [token])

  const login = async (username, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)

    localStorage.setItem('koreaquiz_token', data.token)
    setToken(data.token)
    setUser(data.user)
    return data
  }

  const logout = async () => {
    if (token) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(() => {})
    }
    localStorage.removeItem('koreaquiz_token')
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  )
}
