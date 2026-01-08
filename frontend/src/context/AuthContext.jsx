import React, { createContext, useState, useContext, useEffect } from 'react';
import axios from 'axios';
import { App } from 'antd';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const { message } = App.useApp();

  // Configure axios defaults
  if (token) {
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common['Authorization'];
  }

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const res = await axios.get('/api/users/me');
          setUser(res.data);
        } catch (error) {
          console.error("Auth init failed:", error);
          logout();
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);

  const login = async (username, password) => {
    try {
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);
      
      const res = await axios.post('/api/auth/token', formData);
      const accessToken = res.data.access_token;
      
      localStorage.setItem('token', accessToken);
      setToken(accessToken);
      message.success('登录成功');
      return true;
    } catch (error) {
      message.error('登录失败: ' + (error.response?.data?.detail || error.message));
      return false;
    }
  };

  const register = async (username, password, email) => {
    try {
      await axios.post('/api/auth/register', { username, password, email });
      message.success('注册成功，请登录');
      return true;
    } catch (error) {
      message.error('注册失败: ' + (error.response?.data?.detail || error.message));
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
    message.info('已退出登录');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
