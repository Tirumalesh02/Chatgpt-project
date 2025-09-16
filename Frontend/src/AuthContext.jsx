import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

// Single shared axios instance (prevents effect dependency changes each render)
const api = axios.create({
  baseURL: 'https://chatgpt-project-tr9r.onrender.com/api',
  withCredentials: true
});

// Restore token (if stored) on initial module load
const storedToken = typeof window !== 'undefined' ? localStorage.getItem('auth.token') : null;
if(storedToken){
  api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refreshStatus = useCallback(async () => {
    // Avoid re-trigger if already loaded and user set
    try {
      // Re-apply token header on each refresh attempt (handles race on module load)
      const lt = typeof window !== 'undefined' ? localStorage.getItem('auth.token') : null;
      if(lt){
        api.defaults.headers.common['Authorization'] = `Bearer ${lt}`;
      }
      const res = await api.get('/auth/status');
      if(res.data && res.data.authenticated){
        setUser(res.data.user);
      } else {
        setUser(null);
      }
    } catch (e){
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    setUser(res.data.user);
    if(res.data?.token){
      localStorage.setItem('auth.token', res.data.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    }
    return res.data.user;
  };

  const register = async (email, firstname, lastname, password) => {
    const res = await api.post('/auth/register', { email, fullName: { firstName: firstname, lastName: lastname }, password });
    setUser(res.data.user);
    if(res.data?.token){
      localStorage.setItem('auth.token', res.data.token);
      api.defaults.headers.common['Authorization'] = `Bearer ${res.data.token}`;
    }
    return res.data.user;
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch(_) {}
    setUser(null);
    localStorage.removeItem('auth.token');
    delete api.defaults.headers.common['Authorization'];
  };

  const value = { user, loading, error, login, register, logout, refreshStatus };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(){
  return useContext(AuthContext);
}
