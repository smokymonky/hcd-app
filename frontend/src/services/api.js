// =============================================
// API Service
// Handles all backend communication
// =============================================

import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Create axios instance
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('hcd_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle response errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - logout
      localStorage.removeItem('hcd_token');
      localStorage.removeItem('hcd_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// =============================================
// Auth API
// =============================================

export const authAPI = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  },

  getMe: async () => {
    const response = await api.get('/auth/me');
    return response.data;
  }
};

// =============================================
// Activities API
// =============================================

export const activitiesAPI = {
  getAll: async (filters = {}) => {
    const params = new URLSearchParams(filters).toString();
    const response = await api.get(`/activities?${params}`);
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/activities/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/activities', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/activities/${id}`, data);
    return response.data;
  },

  updateStatus: async (id, status, monthStatus) => {
    const response = await api.patch(`/activities/${id}/status`, { status, month_status: monthStatus });
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/activities/${id}`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/activities/stats/summary');
    return response.data;
  }
};

// =============================================
// Users API
// =============================================

export const usersAPI = {
  getAll: async () => {
    const response = await api.get('/users');
    return response.data;
  },

  getById: async (id) => {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await api.post('/users', data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await api.put(`/users/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  getByFunction: async (func) => {
    const response = await api.get(`/users/by-function/${func}`);
    return response.data;
  }
};

export default api;
