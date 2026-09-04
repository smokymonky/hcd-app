// =============================================
// hrOpsConfig.js — HR Operations canonical MODULE CONFIG (Design v2)
// =============================================
// MODULE ENGINE — Step 2b-1.
//
// This is a FAITHFUL RE-EXPRESSION of the live frontend/src/config/
// hrOpsFields.js in the canonical Design-v2 config shape. It is the
// reference the generic renderer will consume in Step 2b-2.
//
// NOTHING here is wired yet — no imports elsewhere, no behavior change.
// Live HR Ops (hrOpsFields.js, HROpsDataEntry, HROpsSnapshot, the save
// endpoint) is 100% untouched. This file only mirrors the existing
// definition so the engine can later read a module's structure from a
// single config object regardless of which module it is.
//
// FIDELITY CONTRACT
//   - Every field key + label is copied EXACTLY from hrOpsFields.js.
//     Keys are the storage contract — the engine must write to the same
//     field_key values the current form/save already use.
//   - dataType → type   ('number' | 'percentage' | 'currency')
//   - section + subsection carried unchanged.
//   - HO/OP dimension marker (dimension + dimensionRow + dimensionCol)
//     carried exactly for the 16 dimensioned fields.
//   - source:'computed' fields keep source:'computed' AND their formula
//     (the COMPUTERS key, copied verbatim as `formula`).
//   - target objects carried as-is (only saudization_pct has one today).
//   - unit carried where the source declares one; omitted otherwise.
//   - Fields are listed within each section in the same order as the
//     source (its displayOrder), so ordering is preserved structurally.
//
// NOTE ON COUNTS (reconciled against the LIVE file, not the brief):
//   The build brief anticipated 56 fields / 3 formulas / 24 HO-OP dims /
//   3 targets. The LIVE hrOpsFields.js actually defines:
//       52 fields · 7 computed (all 7 with formulas) · 16 HO/OP dims ·
//       1 target (saudization_pct).
//   This config mirrors the LIVE file exactly (per the discipline rule
//   "capture EVERY field exactly"), so the numbers below reflect reality.
//
// SERVICES: kept as individual number fields for now. The labeled_grid
//   conversion (departments/sources/statuses via grid_labels) is a later
//   sub-step and is intentionally NOT done here.
// =============================================

export const hrOpsConfig = {
  code: 'HR_OPS',
  name: 'HR Operations',
  // Same icon as today — the 'hrOps' path from moduleConfig.js ICON_PATHS,
  // rendered inside <svg viewBox="0 0 24 24" stroke="currentColor">.
  icon: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/>',
  period: 'monthly',

  sections: [
    // =========================================
    // SECTION 1 — Head Count & Saudization
    // (subsectioned KPI layout: composition / gender / location /
    //  turnover / compliance)
    // =========================================
    {
      key: 'headcount',
      title: 'Head Count & Saudization',
      order: 1,
      fields: [
        // Headcount Composition
        { key: 'total_employees', label: 'Total Employees', type: 'number',
          section: 'headcount', subsection: 'composition', source: 'manual' },
        { key: 'employee_pct', label: 'Employee %', type: 'percentage',
          section: 'headcount', subsection: 'composition',
          source: 'computed', formula: 'employee_pct' },
        { key: 'outsource_count', label: 'Outsource Count', type: 'number',
          section: 'headcount', subsection: 'composition', source: 'manual' },
        { key: 'outsource_pct', label: 'Outsource %', type: 'percentage',
          section: 'headcount', subsection: 'composition',
          source: 'computed', formula: 'outsource_pct' },

        // Gender Breakdown
        { key: 'female_count', label: 'Female Count', type: 'number',
          section: 'headcount', subsection: 'gender', source: 'manual' },
        { key: 'female_pct', label: 'Female %', type: 'percentage',
          section: 'headcount', subsection: 'gender',
          source: 'computed', formula: 'female_pct' },
        { key: 'male_count', label: 'Male Count', type: 'number',
          section: 'headcount', subsection: 'gender', source: 'manual' },
        { key: 'male_pct', label: 'Male %', type: 'percentage',
          section: 'headcount', subsection: 'gender',
          source: 'computed', formula: 'male_pct' },

        // Location Breakdown
        { key: 'ho_count', label: 'Head Office (HO) Count', type: 'number',
          section: 'headcount', subsection: 'location', source: 'manual' },
        { key: 'ho_pct', label: 'HO %', type: 'percentage',
          section: 'headcount', subsection: 'location',
          source: 'computed', formula: 'ho_pct' },
        { key: 'op_count', label: 'Operations (OP) Count', type: 'number',
          section: 'headcount', subsection: 'location', source: 'manual' },
        { key: 'op_pct', label: 'OP %', type: 'percentage',
          section: 'headcount', subsection: 'location',
          source: 'computed', formula: 'op_pct' },

        // Turnover
        { key: 'turnover_overall_pct', label: 'Overall Turnover', type: 'percentage',
          unit: '%', section: 'headcount', subsection: 'turnover', source: 'manual' },
        { key: 'turnover_ho_pct', label: 'HO Turnover', type: 'percentage',
          unit: '%', section: 'headcount', subsection: 'turnover', source: 'manual' },
        { key: 'turnover_op_pct', label: 'OP Turnover', type: 'percentage',
          unit: '%', section: 'headcount', subsection: 'turnover', source: 'manual' },

        // Compliance & HRDF
        { key: 'saudization_pct', label: 'Saudization', type: 'percentage',
          unit: '%', section: 'headcount', subsection: 'compliance', source: 'manual',
          target: { value: 85.0, direction: 'above', label: 'KSA labor compliance' } },
        { key: 'hrdf_employee_count', label: 'HRDF Employee Count', type: 'number',
          section: 'headcount', subsection: 'compliance', source: 'manual' },
        { key: 'hrdf_amount_sr', label: 'HRDF Amount', type: 'currency',
          unit: 'SR', section: 'headcount', subsection: 'compliance', source: 'manual' },
      ],
    },

    // =========================================
    // SECTION 2 — On-Boarding (HO/OP dimension)
    // =========================================
    {
      key: 'onboarding',
      title: 'On-Boarding',
      order: 2,
      layout: 'ho_op',
      fields: [
        { key: 'new_employee_profiles_ho', label: 'New Employee Profile Creation', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'new_employee_profiles', dimensionCol: 'ho' },
        { key: 'new_employee_profiles_op', label: 'New Employee Profile Creation', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'new_employee_profiles', dimensionCol: 'op' },
        { key: 'id_cards_printed_ho', label: 'ID Cards Printed', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'id_cards_printed', dimensionCol: 'ho' },
        { key: 'id_cards_printed_op', label: 'ID Cards Printed', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'id_cards_printed', dimensionCol: 'op' },
        { key: 'insurance_enrolled_ho', label: 'Insurance Enrolled', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'insurance_enrolled', dimensionCol: 'ho' },
        { key: 'insurance_enrolled_op', label: 'Insurance Enrolled', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'insurance_enrolled', dimensionCol: 'op' },
        { key: 'gosi_qiwa_enrolled_ho', label: 'Gosi / Qiwa Enrolled', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'gosi_qiwa_enrolled', dimensionCol: 'ho' },
        { key: 'gosi_qiwa_enrolled_op', label: 'Gosi / Qiwa Enrolled', type: 'number',
          section: 'onboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'gosi_qiwa_enrolled', dimensionCol: 'op' },
      ],
    },

    // =========================================
    // SECTION 3 — Off-Boarding (HO/OP dimension)
    // =========================================
    {
      key: 'offboarding',
      title: 'Off-Boarding',
      order: 3,
      layout: 'ho_op',
      fields: [
        { key: 'clearance_ho', label: 'Clearance', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'clearance', dimensionCol: 'ho' },
        { key: 'clearance_op', label: 'Clearance', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'clearance', dimensionCol: 'op' },
        { key: 'medical_removal_ho', label: 'Medical Removal', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'medical_removal', dimensionCol: 'ho' },
        { key: 'medical_removal_op', label: 'Medical Removal', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'medical_removal', dimensionCol: 'op' },
        { key: 'gosi_qiwa_removal_ho', label: 'Gosi / Qiwa Removal', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'gosi_qiwa_removal', dimensionCol: 'ho' },
        { key: 'gosi_qiwa_removal_op', label: 'Gosi / Qiwa Removal', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'gosi_qiwa_removal', dimensionCol: 'op' },
        { key: 'sponsorship_transfer_ho', label: 'Sponsorship Transfer', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'sponsorship_transfer', dimensionCol: 'ho' },
        { key: 'sponsorship_transfer_op', label: 'Sponsorship Transfer', type: 'number',
          section: 'offboarding', source: 'manual',
          dimension: 'ho_op', dimensionRow: 'sponsorship_transfer', dimensionCol: 'op' },
      ],
    },

    // =========================================
    // SECTION 4 — Services (17 manual + 1 computed footer total)
    // Kept as individual number fields (labeled_grid conversion is a
    // later sub-step — NOT done here).
    // =========================================
    {
      key: 'services',
      title: 'Services',
      order: 4,
      layout: 'grid',
      fields: [
        { key: 'contract_renewal', label: 'Contract Renewal', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'help_desk_request', label: 'Help Desk Request', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'iqama_renewal', label: 'Iqama Renewal', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'flight_ticket_booking', label: 'Flight Ticket Booking', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'letters', label: 'Letters', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'transfer', label: 'Transfer', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'disciplinary_actions', label: 'Disciplinary Actions', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'probation_period_confirmation', label: 'Probation Confirmation', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'termination', label: 'Termination', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'exit_re_entry', label: 'Exit / Re-Entry', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'letter_attestation', label: 'Letter Attestation', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'professional_license', label: 'Professional License', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'dependent_medical', label: 'Dependent Medical', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'family_visit', label: 'Family Visit Visa', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'business_visit', label: 'Business Visit Visa', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'exit_interviews', label: 'Exit Interviews', type: 'number',
          section: 'services', source: 'manual' },
        { key: 'resignation', label: 'Resignation', type: 'number',
          section: 'services', source: 'manual' },
        // Computed footer total — sum of the 17 service counts above.
        { key: 'total_handled_requests', label: 'Total Handled Requests', type: 'number',
          section: 'services', source: 'computed', formula: 'total_handled_requests' },
      ],
    },
  ],
};

export default hrOpsConfig;
