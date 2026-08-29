# HCD Application — Human Capital Dashboard

**Abdul Latif Jameel Finance**

An internal HR management web application with two main areas:

1. **Annual Plan** — tracks the HR department's yearly activities, programs, and projects (62 seeded activities) with categories, owners, due months, and statuses. Includes filtering, summary stats, and PDF export.
2. **HR Dashboards Hub** — a tile-based hub hosting departmental dashboard modules. The first live module is **HR Operations** (monthly headcount, on-boarding, services SLA), with a full monthly workflow: data entry → submit → admin approve/reject/reopen → publish, plus historical snapshots, trend charts, and admin-managed KPI targets. Additional modules (Talent Acquisition, L&D, HR Systems) are scaffolded in config for future phases.

Access is role-based (Admin, Viewer, plus additional production roles seeded for later phases), with per-module viewer/owner access grants. The frontend is a PWA and can be installed on mobile devices.

---

## 🛠 Tech Stack

| Layer    | Technology |
|----------|------------|
| Frontend | React 18 (Create React App), React Router v6, ApexCharts, PWA (manifest + service worker) |
| Backend  | Node.js, Express 4, JWT auth (`jsonwebtoken`), `bcryptjs` |
| Database | PostgreSQL (`pg`) — hosted on Railway in production |

---

## 📁 Project Structure

```
hcd-app/
├── frontend/                   # React frontend (CRA)
│   ├── public/                 # PWA manifest, service worker, icons
│   └── src/
│       ├── pages/              # Top-level screens
│       │   ├── LoginPage.js
│       │   ├── DashboardPage.js    # Annual Plan dashboard
│       │   ├── AdminPage.js        # User & permission management
│       │   ├── HubPage.js          # HR Dashboards hub (Levels 1 & 2)
│       │   └── HROpsPage.js        # HR Operations module
│       ├── hub/                # Hub tiles, identity card, access modal
│       ├── dashboards/         # HR Ops data entry, snapshot, approvals,
│       │                       #   targets manager, shared widgets
│       ├── config/
│       │   ├── moduleConfig.js     # Single source of truth for hub topology
│       │   └── hrOpsFields.js      # HR Ops field definitions
│       ├── services/api.js     # All API calls, token handling, auto-logout
│       ├── utils/pdfExport.js  # PDF export (Admin only)
│       └── App.js              # Routing
│
├── backend/                    # Node.js / Express API
│   ├── config/
│   │   ├── database.js         # PostgreSQL connection pool
│   │   └── initDatabase.js     # Creates all tables + seeds data on startup
│   ├── middleware/auth.js      # JWT verification, role/permission checks
│   ├── lib/workflow.js         # Module-agnostic workflow state machine
│   ├── routes/
│   │   ├── auth.js             # Login / me / logout
│   │   ├── activities.js       # Annual Plan CRUD + stats
│   │   ├── users.js            # User management (Admin)
│   │   ├── dashboards.js       # Module access, submissions, publish, trends
│   │   ├── workflow.js         # Admin approve/reject/reopen/publish + history
│   │   └── targets.js          # KPI target CRUD (Admin)
│   └── server.js               # Express app entry point
│
└── database/
    ├── schema.sql              # Original Phase 1 schema (reference only)
    └── seed.sql                # Original Phase 1 seed data (reference only)
```

> **Note:** `database/schema.sql` and `seed.sql` are kept for reference but are
> superseded by `backend/config/initDatabase.js`, which creates the full,
> current schema (including dashboard/workflow tables) and seeds initial data
> automatically when the server starts. You do not need to run the SQL files
> by hand.

---

## 🚀 Running Locally

### Prerequisites

- Node.js 18+
- PostgreSQL (a local install, Docker container, or a free Railway database)

### 1. Database

Create an empty PostgreSQL database and note its connection string, e.g.:

```
postgresql://postgres:postgres@localhost:5432/hcd
```

No manual schema setup is needed — the backend creates all tables and seeds
the default admin user, roles, and 62 activities on first startup.

### 2. Backend (port 5000)

```bash
cd backend
npm install
```

Create a `.env` file in `backend/` with:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hcd
JWT_SECRET=change-me-to-a-long-random-string
PORT=5000
```

Then start the server:

```bash
npm start       # or: npm run dev  (auto-reload via nodemon)
```

You should see `Connected to PostgreSQL database` followed by
`HCD Application Backend running on port 5000`. Verify with:

```bash
curl http://localhost:5000/api/health
```

### 3. Frontend (port 3000)

```bash
cd frontend
npm install
```

Create a `.env` file in `frontend/` with:

```env
REACT_APP_API_URL=http://localhost:5000/api
```

> ⚠️ Without this, the frontend defaults to the **production** Railway API
> (`https://hcd-app.up.railway.app/api`), not your local backend.

Then start the dev server:

```bash
npm start
```

The app opens at http://localhost:3000.

### 4. Log in

| Field    | Value                  |
|----------|------------------------|
| Email    | `admin@aljfinance.com` |
| Password | `admin123`             |

(Seeded automatically on first backend startup.)

---

## ⚙️ Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Secret used to sign/verify JWT tokens |
| `PORT` | — | API port (default `5000`) |
| `FRONTEND_URL` | — | CORS allowed origin (default `*`) |
| `NODE_ENV` | — | Set to `production` to enable SSL for the DB connection |
| `PHASE0_SEED_TEST_USER` | — | Set to `true` to seed a test user (dev/testing only; never set in production) |
| `PHASE0_BACKFILL_USERS` | — | Phase 0 user backfill flag (dev/migration only) |

### Frontend (`frontend/.env`)

| Variable | Required | Description |
|----------|----------|-------------|
| `REACT_APP_API_URL` | ✅ (locally) | Backend API base URL, e.g. `http://localhost:5000/api`. Defaults to the production Railway API if unset. |

---

## 🌐 Deployment

- **Backend + database:** Railway. Set `DATABASE_URL`, `JWT_SECRET`,
  `NODE_ENV=production`, and `FRONTEND_URL` in the service environment.
  The database self-initializes on first boot.
- **Frontend:** any static host (`frontend/public/_redirects` is included for
  Netlify-style SPA routing). Build with `npm run build` and set
  `REACT_APP_API_URL` to the deployed API URL at build time.

---

## 📱 Current Features

- ✅ Login with JWT auth, roles & per-module access (viewer/owner)
- ✅ Annual Plan dashboard: view, filter, stats, PDF export (Admin)
- ✅ Admin page: user management & role permissions
- ✅ HR Dashboards Hub (tile-based, config-driven)
- ✅ HR Operations module: monthly data entry, snapshots, trends
- ✅ Approval workflow: submit → approve/reject/reopen → publish, with history
- ✅ KPI targets management (Admin), e.g. Saudization %
- ✅ Responsive (desktop + mobile), installable PWA

## 🔮 Future Phases

- ⏳ Additional hub modules: Talent Acquisition, L&D, HR Systems
- ⏳ Annual Plan approval workflow (engine already registered)
- ⏳ Notifications, comments, direct messages, attachments
  (tables already created)

---

## 🎨 Design

Same look & feel as the v17 Dashboard:
- Dark purple background (#1a1028)
- Gold accents (#F3C036)
- ALJ Finance branding

---

## 📞 Support

Built for Abdul Latif Jameel Finance
HCD Annual Plan 2026
