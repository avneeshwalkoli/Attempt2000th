import React, { createContext, useEffect, useState } from 'react';
import { authApi } from '../services/auth.api';

export const AuthContext = createContext(null);

const TOKEN_KEY = 'vd_auth_token';
const USER_KEY = 'vd_user_profile';

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || null);
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(!!token);

  useEffect(() => {
    let cancelled = false;

    const fetchMe = async () => {
      if (!token) return;
      try {
        const data = await authApi.me(token);
        if (!cancelled) {
          setUser(data.user);
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        }
      } catch (err) {
        if (!cancelled) {
          setToken(null);
          setUser(null);
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(USER_KEY);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (token) {
      fetchMe();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = (nextToken, nextUser) => {
    setToken(nextToken);
    setUser(nextUser);
    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  };

  const value = {
    token,
    user,
    loading,
    login,
    logout,
    isAuthenticated: !!token && !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
