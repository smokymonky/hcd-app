import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ModuleDataEntry from '../dashboards/ModuleDataEntry';
import { dashboardsAPI } from '../services/api';
import hrOpsConfig from '../config/hrOpsConfig';

// =============================================
// ModuleEntryPreview — Module Engine preview host
// =============================================
// MODULE ENGINE — Step 2b-2. Additive preview route:
//   /hub/dashboards/:moduleCode/entry-v2
//
// Renders the GENERIC ModuleDataEntry for a module's config, side by side
// with the live entry (which is untouched). Reuses the same submission +
// save endpoints, so edits here share data with the live form — that's
// what makes parity checkable.
//
// Access gate mirrors the live entry: HR_OPS access at 'owner' or 'admin'
// level required for entry. Period is held in local state (defaults to the
// current month); switching period just re-points at a different
// (module, year, month) submission — no URL params needed for the preview.
//
// Only HR_OPS exists today, so the config map has one entry. Unknown codes
// render a small "no config" notice rather than crashing.
// =============================================

const CONFIG_BY_CODE = {
  HR_OPS: hrOpsConfig,
};

export default function ModuleEntryPreview({ user, onLogout }) {
  const { moduleCode } = useParams();
  const navigate = useNavigate();
  const config = CONFIG_BY_CODE[moduleCode];

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [accessLevel, setAccessLevel] = useState(null);   // 'admin' | 'owner' | 'viewer' | null
  const [accessResolved, setAccessResolved] = useState(false);

  // Resolve the user's access level for this module (same source the live
  // entry uses: /api/dashboards/my-access). Admins pass regardless.
  useEffect(() => {
    let cancelled = false;
    const isAdmin = user && String(user.role || '').toLowerCase() === 'admin';
    if (isAdmin) {
      setAccessLevel('admin');
      setAccessResolved(true);
      return undefined;
    }
    dashboardsAPI.getMyAccess()
      .then((rows) => {
        if (cancelled) return;
        const row = (rows || []).find((r) => r.code === moduleCode || r.module_code === moduleCode);
        setAccessLevel(row ? row.access_level : null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[ModuleEntryPreview] access resolve failed:', err);
        setAccessLevel(null);
      })
      .finally(() => { if (!cancelled) setAccessResolved(true); });
    return () => { cancelled = true; };
  }, [moduleCode, user]);

  function handlePeriodChange(nextYear, nextMonth) {
    setYear(Number(nextYear));
    setMonth(Number(nextMonth));
  }

  if (!config) {
    return (
      <div style={S.shell}>
        <div style={S.notice}>No engine config found for module "{moduleCode}".</div>
      </div>
    );
  }

  if (!accessResolved) {
    return (
      <div style={S.shell}>
        <div style={S.spinner} />
        <style>{`@keyframes hrSpin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Entry requires owner or admin (same as live entry).
  const canEnter = accessLevel === 'owner' || accessLevel === 'admin';
  if (!canEnter) {
    return (
      <div style={S.shell}>
        <div style={S.notice}>
          You don't have entry access to {config.name}. (Entry requires owner or admin.)
        </div>
      </div>
    );
  }

  return (
    <div style={S.shell}>
      <div style={S.topBar}>
        <button type="button" style={S.backBtn} onClick={() => navigate(`/hub/dashboards/${moduleCode}`)}>
          ← Back to {config.name}
        </button>
        <div style={S.title}>
          {config.name} — Data Entry <span style={S.v2}>(engine v2 preview)</span>
        </div>
      </div>
      <ModuleDataEntry
        config={config}
        user={user}
        year={year}
        month={month}
        onPeriodChange={handlePeriodChange}
      />
    </div>
  );
}

const S = {
  shell: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #1a1028 0%, #2d1f42 30%, #3d2856 60%, #4a3265 100%)',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#fff',
    paddingBottom: 60,
  },
  topBar: {
    display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
    padding: '20px 48px 0',
  },
  backBtn: {
    padding: '8px 14px', borderRadius: 8,
    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
    color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
  },
  title: { fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' },
  v2: { fontSize: 12, fontWeight: 600, color: '#F3C036' },
  notice: {
    maxWidth: 600, margin: '80px auto', padding: '20px 24px',
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 12, textAlign: 'center', fontSize: 14, color: 'rgba(255,255,255,0.75)',
  },
  spinner: {
    width: 36, height: 36, margin: '120px auto',
    border: '4px solid rgba(255,255,255,0.1)', borderTopColor: '#F3C036',
    borderRadius: '50%', animation: 'hrSpin 0.8s linear infinite',
  },
};
