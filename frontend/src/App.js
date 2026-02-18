// API Service - Connects frontend to backend
const API_URL = process.env.REACT_APP_API_URL || 'https://hcd-app.up.railway.app/api';

function getToken() {
  return localStorage.getItem('hcd_token');
}

function headers(json = true) {
  const h = {};
  if (json) h['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers(options.body ? true : false), ...options.headers }
  });
  const data = await response.json();
  if (!response.ok) {
    // If token is invalid/expired, auto-logout and redirect to login
    if ((response.status === 401 || response.status === 403) && path !== '/auth/login') {
      const errorMsg = data.error || '';
      if (errorMsg.includes('expired') || errorMsg.includes('Invalid') || errorMsg.includes('No token')) {
        localStorage.removeItem('hcd_token');
        localStorage.removeItem('hcd_user');
        window.location.href = '/login';
        throw new Error('Session expired. Please login again.');
      }
    }
    throw new Error(data.error || data.message || 'Request failed');
  }
  return data;
}

// Auth
export const authAPI = {
  login: (email, password) => request('/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password })
  }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
};

// Activities
export const activitiesAPI = {
  getAll: (filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v && v !== 'all') params.append(k, v); });
    const qs = params.toString();
    return request(`/activities${qs ? '?' + qs : ''}`);
  },
  getOne: (id) => request(`/activities/${id}`),
  create: (data) => request('/activities', {
    method: 'POST', body: JSON.stringify(data)
  }),
  update: (id, data) => request(`/activities/${id}`, {
    method: 'PUT', body: JSON.stringify(data)
  }),
  updateStatus: (id, status, monthStatus) => request(`/activities/${id}/status`, {
    method: 'PATCH', body: JSON.stringify({ status, month_status: monthStatus })
  }),
  delete: (id) => request(`/activities/${id}`, { method: 'DELETE' }),
};

// Users
export const usersAPI = {
  getAll: () => request('/users'),
  create: (data) => request('/users', {
    method: 'POST', body: JSON.stringify(data)
  }),
  update: (id, data) => request(`/users/${id}`, {
    method: 'PUT', body: JSON.stringify(data)
  }),
  delete: (id) => request(`/users/${id}`, { method: 'DELETE' }),
};
