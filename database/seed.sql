-- =============================================
-- HCD Application Seed Data
-- Initial data for Phase 1 (MVP)
-- =============================================

-- =============================================
-- DEFAULT ADMIN USER
-- Password: admin123 (will be encrypted in app)
-- =============================================
INSERT INTO users (name, email, password, role, function)
VALUES ('Admin', 'admin@aljfinance.com', '$2b$10$defaulthashedpassword', 'Admin', 'ALL');

-- =============================================
-- ACTIVITIES DATA (62 activities from v17)
-- =============================================

-- Category: Activities/Programs/Projects (30 items)
INSERT INTO activities (name, category, owner, due_dates, status, month_status, created_by) VALUES
('Update Work Regulations', 'Activities/Programs/Projects', 'OP', ARRAY['May'], 'Scheduled', '{}', 1),
('Talent Review & Calibration Governance', 'Activities/Programs/Projects', 'D&C', ARRAY['Jan'], 'Progressing', '{}', 1),
('Operation Development Program (Sales)', 'Activities/Programs/Projects', 'D&C', ARRAY['Jan'], 'Progressing', '{}', 1),
('Establish Talent Management Function', 'Activities/Programs/Projects', 'D&C', ARRAY['Apr'], 'Scheduled', '{}', 1),
('Summer Promising Training Program', 'Activities/Programs/Projects', 'D&C', ARRAY['Sep'], 'Scheduled', '{}', 1),
('Mentoring Project', 'Activities/Programs/Projects', 'D&C', ARRAY['Nov'], 'Scheduled', '{}', 1),
('In-body Program', 'Activities/Programs/Projects', 'T&A/D&C', ARRAY['Jan'], 'Progressing', '{}', 1),
('Enhance Onboarding Day (CEO Message, Business)', 'Activities/Programs/Projects', 'T&A', ARRAY['Jan'], 'Progressing', '{}', 1),
('Enhancement of Onboarding', 'Activities/Programs/Projects', 'T&A', ARRAY['Sep'], 'Scheduled', '{}', 1),
('University Partnership Program', 'Activities/Programs/Projects', 'T&A', ARRAY['Nov'], 'Scheduled', '{}', 1),
('Wellbeing Program', 'Activities/Programs/Projects', 'OD/SBM', ARRAY['Feb'], 'Scheduled', '{}', 1),
('Activate Feedback Culture Program', 'Activities/Programs/Projects', 'OD/D&C', ARRAY['Jan'], 'Progressing', '{}', 1),
('Work-Life Integration & Flexible Work Models', 'Activities/Programs/Projects', 'OD', ARRAY['Jan'], 'Progressing', '{}', 1),
('Operation Performance Framework', 'Activities/Programs/Projects', 'OD', ARRAY['Jan'], 'Progressing', '{}', 1),
('Establish Culture Function', 'Activities/Programs/Projects', 'OD', ARRAY['Apr'], 'Scheduled', '{}', 1),
('ALJUF Workload Analysis', 'Activities/Programs/Projects', 'OD/Com&Bn', ARRAY['Nov'], 'Scheduled', '{}', 1),
('Implementing New Approach for Gosi (Operation)', 'Activities/Programs/Projects', 'Com&Bn', ARRAY['Feb'], 'Scheduled', '{}', 1),
('Medical Insurance Process Enhancement', 'Activities/Programs/Projects', 'Com&Bn', ARRAY['Apr'], 'Scheduled', '{}', 1),
('Benefits Review & Enhancement', 'Activities/Programs/Projects', 'Com&Bn', ARRAY['Jun'], 'Scheduled', '{}', 1),
('Move Car Loan From Finance to HR', 'Activities/Programs/Projects', 'Com&Bn', ARRAY['Jun'], 'Scheduled', '{}', 1),
('Automate EOS Full Process', 'Activities/Programs/Projects', 'Com&Bn', ARRAY['Oct'], 'Scheduled', '{}', 1),
('OTL Process Enhancement', 'Activities/Programs/Projects', 'Com&Bn', ARRAY['Dec'], 'Scheduled', '{}', 1),
('Enhance KAIZEN', 'Activities/Programs/Projects', 'SBM', ARRAY['Mar'], 'Scheduled', '{}', 1),
('Activate Oracle Mobile Application', 'Activities/Programs/Projects', 'SBM', ARRAY['Apr'], 'Scheduled', '{}', 1),
('Associate Handbook', 'Activities/Programs/Projects', 'SBM', ARRAY['Apr'], 'Scheduled', '{}', 1),
('AI - Phase 2', 'Activities/Programs/Projects', 'SBM', ARRAY['Sep'], 'Scheduled', '{}', 1),
('Multi-Channel HR Support', 'Activities/Programs/Projects', 'SBM', ARRAY['Oct'], 'Scheduled', '{}', 1),
('Recognition & Appreciation Program Framework', 'Activities/Programs/Projects', 'SBM', ARRAY['Dec'], 'Scheduled', '{}', 1),
('Identify Cross Functions Process', 'Activities/Programs/Projects', 'ALL', ARRAY['Mar'], 'Scheduled', '{}', 1),
('HR Process Simplification & Automation - Phase 1', 'Activities/Programs/Projects', 'ALL', ARRAY['Jun'], 'Scheduled', '{}', 1);

-- Category: Maintenance Projects (27 items)
INSERT INTO activities (name, category, owner, due_dates, status, month_status, created_by) VALUES
('2026 Leave Balance Utilization Reminders', 'Maintenance Projects', 'OP', ARRAY['Mar', 'Jun', 'Sep', 'Dec'], 'Scheduled', '{}', 1),
('Yearly Acknowledgment', 'Maintenance Projects', 'OP', ARRAY['Jan'], 'Progressing', '{"Jan": "Completed"}', 1),
('Data Cleansing - Phase 3', 'Maintenance Projects', 'OP', ARRAY['Apr'], 'Scheduled', '{}', 1),
('Maintain Saudization Percentage 85%', 'Maintenance Projects', 'OP', ARRAY['Dec'], 'Scheduled', '{}', 1),
('Bi-Yearly L&D Letter', 'Maintenance Projects', 'D&C', ARRAY['Feb', 'Jun'], 'Scheduled', '{}', 1),
('IDP Submission and Tracking 2026', 'Maintenance Projects', 'D&C', ARRAY['Mar', 'Dec'], 'Scheduled', '{}', 1),
('Succession Planning (Progress, Sub-Committee Meetings)', 'Maintenance Projects', 'D&C', ARRAY['Mar', 'Jun', 'Sep', 'Dec'], 'Scheduled', '{}', 1),
('BoD & Committees Compliance Annual Training 2026', 'Maintenance Projects', 'D&C', ARRAY['Oct'], 'Scheduled', '{}', 1),
('Executive Compliance Workshop', 'Maintenance Projects', 'D&C', ARRAY['Oct'], 'Scheduled', '{}', 1),
('D&C Budget for 2027', 'Maintenance Projects', 'D&C', ARRAY['Nov'], 'Scheduled', '{}', 1),
('L&D Calendar 2027', 'Maintenance Projects', 'D&C', ARRAY['Nov'], 'Scheduled', '{}', 1),
('Mandatory Courses Completion 2026 (100%)', 'Maintenance Projects', 'D&C', ARRAY['Dec'], 'Scheduled', '{}', 1),
('Internal/External Rec Posts', 'Maintenance Projects', 'T&A', ARRAY['Jun'], 'Scheduled', '{}', 1),
('Update Monthly Bank Offers', 'Maintenance Projects', 'OD', ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1),
('Performance Management / Objectives Setting', 'Maintenance Projects', 'OD', ARRAY['Feb', 'Dec'], 'Scheduled', '{}', 1),
('Structure Update & Review', 'Maintenance Projects', 'OD', ARRAY['Mar', 'Jun', 'Sep', 'Dec'], 'Scheduled', '{}', 1),
('Employee Engagement Survey & Action Plans', 'Maintenance Projects', 'OD', ARRAY['Jun'], 'Scheduled', '{}', 1),
('Bonus Cycle 2025/2026', 'Maintenance Projects', 'Com&Bn', ARRAY['Jan', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1),
('Salaries Increase Cycle 2025/2026', 'Maintenance Projects', 'Com&Bn', ARRAY['Jan', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1),
('Manpower Budget & Headcount 2026/2027', 'Maintenance Projects', 'Com&Bn', ARRAY['Oct'], 'Scheduled', '{}', 1),
('Building HR 2027 Strategy', 'Maintenance Projects', 'SBM', ARRAY['Aug'], 'Scheduled', '{}', 1),
('NRC Meetings', 'Maintenance Projects', 'SBM', ARRAY['Mar', 'Jun', 'Aug', 'Nov'], 'Scheduled', '{}', 1),
('Update NRC Charter if applicable', 'Maintenance Projects', 'SBM', ARRAY['Nov'], 'Scheduled', '{}', 1),
('KAIZEN Marathon 2026', 'Maintenance Projects', 'SBM', ARRAY['Sep'], 'Scheduled', '{}', 1),
('HR Jameel', 'Maintenance Projects', 'SBM', ARRAY['Mar', 'Jun', 'Sep', 'Dec'], 'Scheduled', '{}', 1),
('Update HC Policy if applicable', 'Maintenance Projects', 'SBM', ARRAY['Nov'], 'Scheduled', '{}', 1),
('HR Tips', 'Maintenance Projects', 'ALL', ARRAY['Feb', 'Apr', 'Jun', 'Aug', 'Oct', 'Dec'], 'Scheduled', '{}', 1);

-- Category: Reports (5 items)
INSERT INTO activities (name, category, owner, due_dates, status, month_status, created_by) VALUES
('Operation Report - Monthly', 'Reports', 'OP', ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1),
('D&C Report - Monthly', 'Reports', 'D&C', ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1),
('Recruitment Report - Monthly', 'Reports', 'T&A', ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1),
('Annual Plan - Monthly', 'Reports', 'SBM', ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1),
('Risk Report - Monthly', 'Reports', 'SBM', ARRAY['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 'Progressing', '{"Jan": "Completed"}', 1);
