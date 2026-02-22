# HCD Application - Human Capital Dashboard

## Abdul Latif Jameel Finance

---

## 📁 Project Structure

```
hcd-app/
├── frontend/               # React frontend
│   ├── public/
│   │   └── manifest.json   # PWA manifest
│   └── src/
│       ├── pages/
│       │   ├── LoginPage.js
│       │   └── DashboardPage.js
│       ├── services/
│       │   └── api.js      # API connection
│       ├── App.js          # Main app with routing
│       └── index.js        # Entry point
│
├── backend/                # Node.js backend
│   ├── config/
│   │   └── database.js     # Database connection
│   ├── middleware/
│   │   └── auth.js         # Authentication
│   ├── routes/
│   │   ├── auth.js         # Login/logout
│   │   ├── activities.js   # CRUD activities
│   │   └── users.js        # User management
│   ├── server.js           # Main server
│   ├── package.json
│   └── .env.example        # Environment variables
│
└── database/
    ├── schema.sql          # Database tables
    └── seed.sql            # Initial data (62 activities)
```

---

## 🚀 Setup Instructions

### Step 1: Database Setup (Railway)

1. Go to https://railway.app
2. Create new project
3. Add PostgreSQL database
4. Copy the DATABASE_URL
5. Run schema.sql to create tables
6. Run seed.sql to add initial data

### Step 2: Backend Setup

```bash
cd backend
cp .env.example .env
# Edit .env with your DATABASE_URL
npm install
npm start
```

### Step 3: Frontend Setup

```bash
cd frontend
npm install
npm start
```

---

## 👤 Default Login

- Email: admin@aljfinance.com
- Password: admin123

---

## 📱 Phase 1 (MVP) Features

- ✅ Login system
- ✅ Dashboard (v17 design)
- ✅ View activities
- ✅ Filter activities
- ✅ Export PDF (Admin only)
- ✅ Two roles: Admin & Viewer
- ✅ Responsive (desktop + mobile)
- ✅ PWA (installable on phone)

---

## 🔮 Future Phases (Ready)

- ⏳ More roles (HR Director, Function Head, etc.)
- ⏳ Approval flow
- ⏳ Notifications
- ⏳ Comments
- ⏳ Direct messages
- ⏳ Attachments
- ⏳ KPI Dashboard tab

---

## 🎨 Design

Same look & feel as v17 Dashboard:
- Dark purple background (#1a1028)
- Gold accents (#F3C036)
- ALJ Finance branding

---

## 📞 Support

Built for Abdul Latif Jameel Finance
HCD Annual Plan 2026

