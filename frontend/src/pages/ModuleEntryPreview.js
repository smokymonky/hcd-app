import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ModuleDataEntry from '../dashboards/ModuleDataEntry';
import { dashboardsAPI, targetsAPI } from '../services/api';

// =============================================
// ModuleEntryPreview — Module Engine preview host
// =============================================
// DASHBOARD BUILDER — Step B2. Preview route:
//   /hub/preview/:moduleCode/entry-v2
//
// Now renders ENTIRELY from the DB structure (GET /:moduleCode/structure,
// Step B1) instead of the static hrOpsConfig file. It fetches:
//   1. the module STRUCTURE (sections + fields), and
//   2. active TARGETS (field_targets — NOT part of /structure by design),
//      merged onto matching fields by key so the Saudization target helper
//      stays at parity with the live entry.
// then hands the assembled config-shaped object to the generic
// ModuleDataEntry. Computed fields evaluate via the curated formula model
// (formula_type/formula_args) inside the engine. The live entry + save are
// untouched; edits here write to the same submission/keys.
//
// Access gate mirrors the live entry: owner or admin for entry.
// Period is local state (defaults to current month).
// =============================================

// Friendly display names (cosmetic only — structure carries module_code).
const MODULE_NAME_BY_CODE = {
  HR_OPS: 'HR Operations',
  TA: 'Talent Acquisition',
  'L&D': 'Learning & Development',
  HR_SYS: 'HR Systems',
};

export default function ModuleEntryPreview({ user, onLogout }) {
  const { moduleCode } = useParams();
  const navigate = useNavigate();

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const [accessLevel, setAccessLevel] = useState(null);   // 'admin' | 'owner' | 'viewer' | null
  const [accessResolved, setAccessResolved] = useState(false);

  // DB-driven structure (assembled config-shaped object) + load state.
  const [config, setConfig] = useState(null);
  const [structureLoading, setStructureLoading] = useState(true);
  const [structureError, setStructureError] = useState(null);

  // Resolve the user's access level (same source as live: my-access).
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

  // Fetch STRUCTURE + TARGETS from the DB and assemble the config object.
  useEffect(() => {
    let cancelled = false;
    setStructureLoading(true);
    setStructureError(null);
    setConfig(null);

    Promise.all([
      dashboardsAPI.getStructure(moduleCode),
      // Targets aren't in /structure (they live in field_targets). Merge
      // active ones by key so the target helper matches live. Tolerate a
      // targets fetch failure — structure still renders (just no helper).
      targetsAPI.list(moduleCode).catch((e) => {
        console.error('[ModuleEntryPreview] targets fetch failed (non-fatal):', e);
        return [];
      }),
    ])
      .then(([structure, targets]) => {
        if (cancelled) return;
        const targetByKey = {};
        (Array.isArray(targets) ? targets : []).forEach((t) => {
          if (t.is_active === false) return;
          targetByKey[t.field_key] = {
            value: Number(t.target_value),
            direction: t.direction,
            tolerance: (t.tolerance == null) ? null : Number(t.tolerance),
            label: (t.label && String(t.label).trim() !== '') ? String(t.label) : undefined,
          };
        });

        const sections = (structure.sections || []).map((s) => ({
          key: s.key,
          title: s.title,
          layout: s.layout,
          sort_order: s.sort_order,
          fields: (s.fields || []).map((f) => ({
            ...f,
            section: s.key,
            target: targetByKey[f.key] || undefined,
          })),
        }));

        setConfig({
          code: structure.module_code || moduleCode,
          name: MODULE_NAME_BY_CODE[moduleCode] || moduleCode,
          sections,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('[ModuleEntryPreview] structure fetch failed:', err);
        setStructureError(err && err.message ? err.message : 'Could not load module structure.');
      })
      .finally(() => { if (!cancelled) setStructureLoading(false); });

    return () => { cancelled = true; };
  }, [moduleCode]);

  function handlePeriodChange(nextYear, nextMonth) {
    setYear(Number(nextYear));
    setMonth(Number(nextMonth));
  }

  if (!accessResolved || structureLoading) {
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
          You don't have entry access to {MODULE_NAME_BY_CODE[moduleCode] || moduleCode}. (Entry requires owner or admin.)
        </div>
      </div>
    );
  }

  if (structureError) {
    return (
      <div style={S.shell}>
        <div style={S.notice}>Could not load structure for "{moduleCode}": {structureError}</div>
      </div>
    );
  }

  if (!config || !config.sections || config.sections.length === 0) {
    return (
      <div style={S.shell}>
        <div style={S.notice}>No structure found for module "{moduleCode}". (Has it been seeded?)</div>
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
          {config.name} — Data Entry <span style={S.v2}>(engine v2 · DB-driven)</span>
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
