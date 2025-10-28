import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  fetchCurrentUser,
  login as apiLogin,
  logout as apiLogout,
  changePassword as apiChangePassword,
  setAuthToken,
} from '../api'
import type { AuthUser } from '../types'

type AuthContextValue = {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refresh: () => Promise<void>
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>
}

const STORAGE_KEY = 'mc:auth:v1'

const AuthContext = createContext<AuthContextValue | null>(null)

function loadStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof parsed.token === 'string') {
      return parsed.token
    }
    return null
  } catch {
    return null
  }
}

function storeToken(token: string | null) {
  try {
    if (!token) {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token }))
    }
  } catch {
    // Ignore storage errors (e.g., private mode)
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const cachedToken = loadStoredToken()
    if (!cachedToken) {
      setLoading(false)
      return
    }

    setAuthToken(cachedToken)
    setToken(cachedToken)

    fetchCurrentUser()
      .then((res) => {
        if (cancelled) return
        setUser(res.user)
      })
      .catch(() => {
        if (cancelled) return
        setAuthToken(null)
        storeToken(null)
        setToken(null)
        setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiLogin({ email, password })
    setAuthToken(res.token)
    storeToken(res.token)
    setToken(res.token)
    setUser(res.user)
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } catch {
      // Ignore network/sandbox failures on logout
    }
    setAuthToken(null)
    storeToken(null)
    setToken(null)
    setUser(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!token) return
    try {
      const res = await fetchCurrentUser()
      setUser(res.user)
    } catch {
      setAuthToken(null)
      storeToken(null)
      setToken(null)
      setUser(null)
    }
  }, [token])

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await apiChangePassword({ currentPassword, newPassword })
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      login,
      logout,
      refresh,
      changePassword,
    }),
    [changePassword, loading, login, logout, refresh, token, user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}
