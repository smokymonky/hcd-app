-- =============================================
-- HCD Application Database Schema
-- Phase 1 (MVP) + Future Ready
-- =============================================

-- =============================================
-- TABLE 1: Users
-- Status: ACTIVE (Phase 1)
-- =============================================
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'Viewer',
    function VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Future ready fields (nullable)
    phone VARCHAR(20),
    profile_picture VARCHAR(255),
    job_title VARCHAR(100),
    employee_id VARCHAR(50)
);

-- =============================================
-- TABLE 2: Activities
-- Status: ACTIVE (Phase 1)
-- =============================================
CREATE TABLE activities (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(100) NOT NULL,
    owner VARCHAR(50) NOT NULL,
    due_dates TEXT[] NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Scheduled',
    description TEXT,
    assigned_to INTEGER REFERENCES users(id),
    notes TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Future ready fields (nullable)
    priority VARCHAR(20),
    month_status JSONB DEFAULT '{}'
);

-- =============================================
-- TABLE 3: Attachments
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE attachments (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INTEGER,
    file_type VARCHAR(50),
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE 4: Comments
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE comments (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    comment_text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE 5: Messages
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INTEGER REFERENCES users(id),
    recipient_id INTEGER REFERENCES users(id),
    subject VARCHAR(255),
    message_text TEXT NOT NULL,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE 6: Notifications
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE 7: Approvals
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE approvals (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
    request_type VARCHAR(50) NOT NULL,
    requested_by INTEGER REFERENCES users(id),
    current_approver INTEGER REFERENCES users(id),
    status VARCHAR(50) DEFAULT 'pending',
    approver_level INTEGER DEFAULT 1,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE 8: Notification Settings
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE notification_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) UNIQUE,
    notify_assigned BOOLEAN DEFAULT true,
    notify_comment BOOLEAN DEFAULT true,
    notify_message BOOLEAN DEFAULT true,
    notify_deadline BOOLEAN DEFAULT true
);

-- =============================================
-- TABLE 9: Role Permissions
-- Status: ACTIVE (Phase 1)
-- =============================================
CREATE TABLE role_permissions (
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) UNIQUE NOT NULL,
    can_view BOOLEAN DEFAULT true,
    can_export_pdf BOOLEAN DEFAULT false,
    can_create BOOLEAN DEFAULT false,
    can_edit BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_complete BOOLEAN DEFAULT false,
    can_approve BOOLEAN DEFAULT false,
    can_comment BOOLEAN DEFAULT false,
    can_manage_users BOOLEAN DEFAULT false,
    can_assign_roles BOOLEAN DEFAULT false,
    can_system_settings BOOLEAN DEFAULT false
);

-- =============================================
-- TABLE 10: Approval History
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE approval_history (
    id SERIAL PRIMARY KEY,
    approval_id INTEGER REFERENCES approvals(id) ON DELETE CASCADE,
    approver_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    comments TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- TABLE 11: Activity History
-- Status: READY (Phase 2)
-- =============================================
CREATE TABLE activity_history (
    id SERIAL PRIMARY KEY,
    activity_id INTEGER REFERENCES activities(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    old_value TEXT,
    new_value TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- INITIAL DATA: Role Permissions (Phase 1)
-- =============================================
INSERT INTO role_permissions (role, can_view, can_export_pdf, can_create, can_edit, can_delete, can_complete, can_approve, can_comment, can_manage_users, can_assign_roles, can_system_settings)
VALUES 
    ('Admin', true, true, true, true, true, true, true, true, true, true, true),
    ('Viewer', true, false, false, false, false, false, false, false, false, false, false),
    -- Future roles (ready but not used in Phase 1)
    ('HR Director', true, true, true, true, true, true, true, true, false, false, false),
    ('Function Head', true, false, true, true, true, true, true, true, false, false, false),
    ('Employee', true, false, true, true, true, true, false, true, false, false, false),
    ('ES Managing Director', true, true, false, false, false, false, false, true, false, false, false),
    ('CEO', true, true, false, false, false, false, false, true, false, false, false);

-- =============================================
-- INDEXES (for faster queries)
-- =============================================
CREATE INDEX idx_activities_category ON activities(category);
CREATE INDEX idx_activities_owner ON activities(owner);
CREATE INDEX idx_activities_status ON activities(status);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);
CREATE INDEX idx_messages_recipient ON messages(recipient_id, is_read);
CREATE INDEX idx_approvals_status ON approvals(status);
