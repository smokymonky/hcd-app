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

  // ACCESS MGMT — manual module-access management (admin-only)
  // GET the user's module-access rows (module_id, code, name, level, source).
  getAccess: (id) => request(`/users/${id}/access`),
  // POST a manual grant/relabel: { module_id | module_code, access_level }.
  grantAccess: (id, data) => request(`/users/${id}/access`, {
    method: 'POST', body: JSON.stringify(data)
  }),
  // DELETE a module-access row (any source).
  revokeAccess: (id, moduleId) => request(`/users/${id}/access/${moduleId}`, {
    method: 'DELETE'
  }),
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

  // GET /api/dashboards/admin-queue (admin only) — PHASE 2C
  // Full non-draft pipeline across all modules:
  // submitted, head_reviewed, director_reviewed, approved, published.
  // Used by the Approvals tab (ApprovalsManager).
  getAdminQueue: () => request('/dashboards/admin-queue'),

  // GET /api/dashboards/:moduleCode/structure — DASHBOARD BUILDER Step B1
  // Returns the DB-backed active structure (ordered sections + fields).
  // The B2 renderer consumes this instead of the config file.
  getStructure: (moduleCode) => request(`/dashboards/${encodeURIComponent(moduleCode)}/structure`),
};

// =============================================
// Structure (Dashboard Builder Step B3a) — admin structure CRUD
// =============================================
// Create/edit/soft-delete/restore/reorder sections + fields in
// module_sections / module_fields. Admin-only on the backend. Keys are
// immutable after create. Consumed by the B3b builder UI.
const enc = encodeURIComponent;
export const structureAPI = {
  // Sections
  createSection: (code, payload) => request(`/dashboards/${enc(code)}/sections`, {
    method: 'POST', body: JSON.stringify(payload)
  }),
  updateSection: (code, id, payload) => request(`/dashboards/${enc(code)}/sections/${id}`, {
    method: 'PUT', body: JSON.stringify(payload)
  }),
  deleteSection: (code, id) => request(`/dashboards/${enc(code)}/sections/${id}`, {
    method: 'DELETE'
  }),
  restoreSection: (code, id) => request(`/dashboards/${enc(code)}/sections/${id}/restore`, {
    method: 'POST', body: JSON.stringify({})
  }),
  reorderSections: (code, orderedIds) => request(`/dashboards/${enc(code)}/sections/reorder`, {
    method: 'PUT', body: JSON.stringify({ orderedIds })
  }),

  // Fields
  createField: (code, sectionId, payload) => request(`/dashboards/${enc(code)}/sections/${sectionId}/fields`, {
    method: 'POST', body: JSON.stringify(payload)
  }),
  updateField: (code, id, payload) => request(`/dashboards/${enc(code)}/fields/${id}`, {
    method: 'PUT', body: JSON.stringify(payload)
  }),
  deleteField: (code, id) => request(`/dashboards/${enc(code)}/fields/${id}`, {
    method: 'DELETE'
  }),
  restoreField: (code, id) => request(`/dashboards/${enc(code)}/fields/${id}/restore`, {
    method: 'POST', body: JSON.stringify({})
  }),
  reorderFields: (code, orderedIds) => request(`/dashboards/${enc(code)}/fields/reorder`, {
    method: 'PUT', body: JSON.stringify({ orderedIds })
  }),
};

// =============================================
// Labels (Module Engine Step 2a) — grid_labels management
// =============================================
// Editable department/source/status labels for the 'labeled_grid' engine
// type. Owner/admin-gated on the backend. Consumed by the Step 2b UI.
export const labelsAPI = {
  // GET /api/dashboards/:code/labels?section=&includeHidden=
  getLabels: (code, { section, includeHidden } = {}) => {
    const qs = new URLSearchParams();
    if (section) qs.set('section', section);
    if (includeHidden) qs.set('includeHidden', 'true');
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/dashboards/${encodeURIComponent(code)}/labels${suffix}`);
  },
  // POST /api/dashboards/:code/labels  { section_key, label }
  addLabel: (code, { section_key, label }) => request(
    `/dashboards/${encodeURIComponent(code)}/labels`,
    { method: 'POST', body: JSON.stringify({ section_key, label }) }
  ),
  // PUT /api/dashboards/:code/labels/:id  { label }  — rename (stable id)
  renameLabel: (code, id, label) => request(
    `/dashboards/${encodeURIComponent(code)}/labels/${id}`,
    { method: 'PUT', body: JSON.stringify({ label }) }
  ),
  // DELETE /api/dashboards/:code/labels/:id  — soft-hide
  hideLabel: (code, id) => request(
    `/dashboards/${encodeURIComponent(code)}/labels/${id}`,
    { method: 'DELETE' }
  ),
  // POST /api/dashboards/:code/labels/:id/restore  — un-hide
  restoreLabel: (code, id) => request(
    `/dashboards/${encodeURIComponent(code)}/labels/${id}/restore`,
    { method: 'POST', body: JSON.stringify({}) }
  ),
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
  // POST /api/workflow/admin-publish — PHASE 2C
  // Transition approved -> published (admin only). Reason optional.
  adminPublish: (target_type, target_id, reason) => request('/workflow/admin-publish', {
    method: 'POST', body: JSON.stringify({ target_type, target_id, reason })
  }),
  getHistory: (target_type, target_id) =>
    request(`/workflow/history?target_type=${encodeURIComponent(target_type)}&target_id=${target_id}`),
  listTargets: () => request('/workflow/targets'),
};

// =============================================
// Targets (Phase 2B — admin-only)
// =============================================
// CRUD against /api/targets for the field_targets table.
// All endpoints are admin-gated on the backend.
//
// Frontend callers:
//   - TargetsManager.js (admin UI inside AdminPage Targets tab)
//   - HROpsPage.js hydration on mount (reads active targets to merge
//     into FIELDS before rendering Entry/Snapshot)
// =============================================
export const targetsAPI = {
  // GET /api/targets[?module=HR_OPS]
  // Admin endpoint — returns ACTIVE + SOFT-DELETED rows.
  // The hydration path (non-admin readers in theory don't get here in
  // Phase 2B because module access bypasses admin only for admins, but
  // we always pass through the same endpoint; if a non-admin somehow
  // calls it the backend will 403 and HROpsPage will continue with
  // inline seed-only targets).
  list: (moduleCode) => {
    const qs = moduleCode ? `?module=${encodeURIComponent(moduleCode)}` : '';
    return request(`/targets${qs}`);
  },

  // POST /api/targets
  // Body: { module, field_key, target_value, direction, tolerance?, label? }
  create: (payload) => request('/targets', {
    method: 'POST', body: JSON.stringify(payload)
  }),

  // PUT /api/targets/:id
  // Body: any subset of { target_value, direction, tolerance, label, is_active }
  // - Setting is_active=true on a soft-deleted target = RESTORE flow
  // - Module + field_key are immutable post-creation
  update: (id, payload) => request(`/targets/${id}`, {
    method: 'PUT', body: JSON.stringify(payload)
  }),

  // DELETE /api/targets/:id
  // SOFT-delete only: sets is_active=false, deleted_by, deleted_at.
  remove: (id) => request(`/targets/${id}`, { method: 'DELETE' }),
};
