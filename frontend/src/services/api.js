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

// =============================================
// Dashboards (Phase 1+)
// =============================================
// Generic helpers around /api/dashboards endpoints. Phase 1 only
// uses getMyAccess(); the rest are exported for Phases 2-6 to use
// without re-adding helpers.
// =============================================
export const dashboardsAPI = {
  // GET /api/dashboards/my-access
  // Returns array of dashboard modules the current user can access.
  // For admin: all active modules with access_level='admin'.
  // For others: rows from user_module_access joined with dashboard_modules.
  // Tolerates optional fields the backend may add later (lastViewed,
  // favorited, pinned, etc. — Rule 13 #6).
  getMyAccess: () => request('/dashboards/my-access'),

  // GET /api/dashboards/modules — full list (any authed user)
  listModules: () => request('/dashboards/modules'),

  // GET /api/dashboards/:moduleCode/submissions?year=&status=
  listSubmissions: (moduleCode, filters = {}) => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v != null && v !== '') params.append(k, v); });
    const qs = params.toString();
    return request(`/dashboards/${encodeURIComponent(moduleCode)}/submissions${qs ? '?' + qs : ''}`);
  },

  // GET /api/dashboards/submissions/:id
  getSubmission: (submissionId) => request(`/dashboards/submissions/${submissionId}`),

  // POST /api/dashboards/:moduleCode/submissions
  saveSubmission: (moduleCode, payload) => request(
    `/dashboards/${encodeURIComponent(moduleCode)}/submissions`,
    { method: 'POST', body: JSON.stringify(payload) }
  ),

  // POST /api/dashboards/submissions/:id/submit
  submitSubmission: (submissionId) => request(
    `/dashboards/submissions/${submissionId}/submit`,
    { method: 'POST', body: JSON.stringify({}) }
  ),

  // GET /api/dashboards/:moduleCode/published?year=&month=
  getPublished: (moduleCode, year, month) => request(
    `/dashboards/${encodeURIComponent(moduleCode)}/published?year=${year}&month=${month}`
  ),

  // GET /api/dashboards/:moduleCode/trends?field_key=&year=
  getTrends: (moduleCode, fieldKey, year) => request(
    `/dashboards/${encodeURIComponent(moduleCode)}/trends?field_key=${encodeURIComponent(fieldKey)}&year=${year}`
  ),

  // GET /api/dashboards/pending-approval (admin only)
  getPendingApproval: () => request('/dashboards/pending-approval'),
};

// =============================================
// Workflow (Phase 1+ — admin/review actions)
// =============================================
export const workflowAPI = {
  adminApprove: (target_type, target_id, reason) => request('/workflow/admin-approve', {
    method: 'POST', body: JSON.stringify({ target_type, target_id, reason })
  }),
  adminReject: (target_type, target_id, reason) => request('/workflow/admin-reject', {
    method: 'POST', body: JSON.stringify({ target_type, target_id, reason })
  }),
  adminReopen: (target_type, target_id, reason) => request('/workflow/admin-reopen', {
    method: 'POST', body: JSON.stringify({ target_type, target_id, reason })
  }),
  getHistory: (target_type, target_id) =>
    request(`/workflow/history?target_type=${encodeURIComponent(target_type)}&target_id=${target_id}`),
  listTargets: () => request('/workflow/targets'),
};
