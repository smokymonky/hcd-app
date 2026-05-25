// =============================================
// moduleConfig.js — Hub Shell (Phase 1)
// =============================================
// Rule 13 (Scalability First):
//   - Single source of truth for hub structure
//   - "Shell" = static config defining hub topology
//   - "Fill"  = API data from /api/dashboards/my-access populating
//     category children at runtime
//   - Adding future modules = adding config entries, never touching
//     render code in HubPage.js or HubTile.js
//
// Module types:
//   - module:    a leaf — clicking navigates to its route
//   - category:  a branch — clicking drills into Level 2 showing
//                children populated by API + static fallback
//
// Field reference (mirrors hcd_hub_mockup_v3.html MODULE_CONFIG):
//   id                       string, stable key for the entry
//   type                     'module' | 'category'
//   title                    display title on tile
//   description              short noun-fragment description
//   drilldownSubtitle        (category only) shown on L2 header
//   icon                     SVG path/g element rendered inside <svg viewBox="0 0 24 24">
//   route                    (module only) react-router path to navigate on click
//   parent                   (children only) parent category id
//   moduleCode               (dashboard children only) backend code, e.g. 'HR_OPS'
//   sortOrder                integer for stable ordering
//   isStatic                 true → defined here; false → comes from API
//   allowsCreation           (category only, Rule 13 #4) → renders + New action
//   newActionLabel           (category only) label for the + button (defaults '+ New Item')
//   newActionDisabledReason  (category only) optional tooltip text when not yet active
//   requiredAccess           (dashboard children only) 'viewer' | 'owner'
// =============================================

// SVG path content for each icon. Wrapped at render time inside
// <svg viewBox="0 0 24 24" stroke="currentColor" ...>.
export const ICON_PATHS = {
  annualPlan: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>',
  dashboards: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>',
  hrOps: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>',
  ta: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>',
  ld: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>',
  hrSys: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>',
  lock: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>',
};

// Map dashboard module codes (from API) → presentation metadata.
// This is the merge surface: API returns module codes; the Hub
// pairs each with this metadata. Codes the API returns that we
// don't recognize here render with safe defaults (graceful degrade).
export const DASHBOARD_CODE_META = {
  HR_OPS: {
    id: 'hr_ops',
    description: 'Monthly headcount, on-boarding, services SLA.',
    iconKey: 'hrOps',
    route: '/hub/dashboards/HR_OPS',
  },
  TA: {
    id: 'ta',
    description: 'Hiring funnel, time-to-fill, sources.',
    iconKey: 'ta',
    // L&D module code contains an ampersand (audit Section 11.1 tech debt) — URLs are
    // URL-encoded at navigation time. The static route here is just a template.
    route: '/hub/dashboards/TA',
  },
  'L&D': {
    id: 'ld',
    description: 'Training, IDPs, succession.',
    iconKey: 'ld',
    route: '/hub/dashboards/L%26D',
  },
  HR_SYS: {
    id: 'hr_sys',
    description: 'Systems availability, ticket SLAs, automation.',
    iconKey: 'hrSys',
    route: '/hub/dashboards/HR_SYS',
  },
};

// =============================================
// HUB SHELL — defines the structural topology of the Hub.
// Category children are populated by API at runtime.
// =============================================
export const HUB_SHELL = [
  {
    id: 'annual_plan',
    type: 'module',
    title: 'Annual Plan',
    description: 'Track 68 HR initiatives across 6 functions.',
    iconKey: 'annualPlan',
    route: '/dashboard',                  // existing Annual Plan page
    sortOrder: 1,
    isStatic: true,
    requiredAccess: null,                 // all authed users; existing app gates internally
  },
  {
    id: 'hr_dashboards',
    type: 'category',
    title: 'HR Dashboards',
    description: 'Monthly operational metrics, 4 modules.',
    drilldownSubtitle: 'Monthly operational metrics. Submit → review → publish.',
    iconKey: 'dashboards',
    sortOrder: 2,
    isStatic: true,
    // children are filled at runtime from /api/dashboards/my-access
    childrenSource: 'api:dashboards',
    allowsCreation: true,                 // admin sees + New Dashboard button on L2
    newActionLabel: '+ New Dashboard',
    newActionDisabledReason: 'Dashboard creation arrives in Phase 8 (Universal Admin Panel).',
  },
  // Future top-level entries (Finance Dashboards, Compliance Reports, etc.)
  // get added here. Rule 13: same shape, no special-casing.
];

// =============================================
// Helpers
// =============================================

// Get a shell entry by id.
export function getShellEntry(id) {
  return HUB_SHELL.find((e) => e.id === id) || null;
}

// Build the children of a category by merging API-fetched modules
// with DASHBOARD_CODE_META. Returns an array of tile-shaped objects.
// apiModules: array from /api/dashboards/my-access (may be undefined → empty)
export function buildCategoryChildren(categoryId, apiModules) {
  const category = getShellEntry(categoryId);
  if (!category || category.type !== 'category') return [];

  if (category.childrenSource === 'api:dashboards') {
    const list = Array.isArray(apiModules) ? apiModules : [];
    return list.map((m) => {
      const meta = DASHBOARD_CODE_META[m.code] || {};
      return {
        // Identity
        id: meta.id || `dashboard_${m.code.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        type: 'module',
        parent: category.id,
        // Display
        title: m.name,
        description: meta.description || m.description || '',
        iconKey: meta.iconKey || 'dashboards',
        route: meta.route || `/hub/dashboards/${encodeURIComponent(m.code)}`,
        // Backend
        moduleCode: m.code,
        accessLevel: m.access_level,           // 'admin' | 'owner' | 'viewer' (from API)
        // API may add optional fields (lastViewed, favorited, pinned) — pass through
        // any extra keys untouched so future fields don't crash this code (Rule 13 #6).
        extras: { ...m },
        sortOrder: m.sort_order || 0,
      };
    }).sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Future childrenSource types (e.g. 'static:list', 'api:reports') plug in here.
  return [];
}

// Build the top-level tiles for Level 1. Pure pass-through of HUB_SHELL
// (no API merging at Level 1 — that's by design for Phase 1).
export function buildLevel1Tiles() {
  return [...HUB_SHELL].sort((a, b) => a.sortOrder - b.sortOrder);
}
