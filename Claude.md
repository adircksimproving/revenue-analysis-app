# Revenue Analysis App

Project financial tracking tool for delivery managers. Imports Workday CSV exports to record consultant hours billed per week, then layers a forecast over actuals to project total spend against a project budget. Outputs a chart with a budget burn line and a PDF export.

**Production:** https://revenue-analysis-app-production.up.railway.app/
**GitHub:** https://github.com/adircksimproving/revenue-analysis-app

---

## App Ecosystem

These three apps share a common auth layer (portal) and serve the same users (delivery managers, project managers). Before changing anything related to auth, routing, user identity, or navigation — check what portal does first.

| Repo | Local Path | Production URL | Role |
|---|---|---|---|
| `portal` | `~/Documents/projects/internal/portal-main` | https://portal-production-2c38.up.railway.app/ | Auth hub — login page and app dashboard |
| `revenue-analysis-app` | `~/Documents/projects/internal/revenue-analysis-app-main` | https://revenue-analysis-app-production.up.railway.app/ | Project financial tracking and forecasting |
| `consultant-directory-app` | `~/Documents/projects/internal/consultant-directory-app-main` | https://consultant-directory-app-production.up.railway.app/ | Consultant search and profile directory |

### Load sibling repos in a session

```bash
claude --add-dir ~/Documents/projects/internal/revenue-analysis-app-main \
       --add-dir ~/Documents/projects/internal/consultant-directory-app-main

/add-dir ~/Documents/projects/internal/portal-main
```

### Cross-repo rules

- Auth is owned by portal. This app reads the `portal_sid` cookie from each request and resolves identity by calling portal's `/api/me`. Never validate credentials here.
- Consultant name is the shared identity key with `consultant-directory-app`. Both apps have a `consultants` table keyed by `name`. If you change the name format or add an external ID field, check impact in `consultant-directory-app/server/db.js`.
- Do NOT modify files in sibling repos unless explicitly asked. If a change here requires follow-up elsewhere, say so: "Follow-up needed in [repo]: [what and where]."

---

## Auth integration

Portal owns identity, sessions, and roles. This app maintains its own session keyed by a `rev_sid` cookie, populated via portal's cross-domain handoff flow. Cookies don't cross Railway subdomains, so we don't share `portal_sid` directly.

**Login flow:**
1. Browser hits `/api/*` without `rev_sid` → 401 JSON. HTML pages → 302 to `/auth/portal`.
2. `/auth/portal` redirects the browser to `${PORTAL_URL}/auth/handoff?return=<our-callback>`.
3. Portal mints a one-time, 60s, single-use token and 302s to `/auth/callback?portal_token=...`. If the user isn't logged in to portal, portal routes them through its login page first and resumes the handoff after.
4. `/auth/callback` exchanges the token server-to-server at `${PORTAL_URL}/api/exchange`, gets `{id, email, name, role, isAdmin}`, upserts into local `users` keyed by `portal_user_id`, creates a local session, and sets `rev_sid`.
5. Subsequent requests use `rev_sid` — no per-request call to portal.

**Sessions:** in-memory `Map` in `server/middleware/portalAuth.js`, 7-day TTL. Restarts log everyone out (acceptable for an internal tool).

**Roles:** read from the portal exchange and stored in the local session, surfaced as `req.user.role` and `req.user.isAdmin`. The local `users.role` column is unused — never read it for auth decisions. Role changes in portal will not propagate until the user's local session expires or they log out and back in.

**Admin UI:** lives in portal. `account.html` shows an "Admin" link to `${PORTAL_URL}/admin.html` only when `me.isAdmin` is true.

**Sign out:** `/auth/logout` clears `rev_sid` and redirects to portal root. It does NOT invalidate the portal session — the user remains signed in to portal and other sibling apps until they sign out from portal directly.

**Cross-user isolation:** every route scopes its DB queries by `req.userId`. Tested in `tests/isolation.test.js`.

Required env var: `PORTAL_URL` (defaults to `http://localhost:3001` for dev).

---

## This Repo: Structure & Key Files

```
revenue-analysis-app/
├── index.html              # Login page (frontend validation only — no real auth)
├── home.html               # Project list dashboard
├── account.html            # User profile, client hierarchy view
├── project.html            # Main analysis workspace: metrics, table, chart
├── js/
│   ├── app.js              # Page init and routing logic
│   ├── api.js              # All fetch calls to /api/* — 8 endpoints, single source of truth
│   ├── state.js            # Shared mutable state object across modules
│   ├── csv-parser.js       # Raw CSV text → array of row objects
│   ├── data-processor.js   # Parsed rows → consultant + weekly hours buckets
│   ├── upload.js           # Drives the CSV upload flow (parse → process → POST)
│   ├── modal.js            # Forecast hours-per-week dialog logic
│   ├── metrics.js          # Actuals, forecast, variance, burn rate calculations
│   ├── chart.js            # Chart.js rendering, bridge pattern, PDF export via jsPDF
│   ├── table.js            # Quarterly hours table rendering
│   └── date-utils.js       # Week key formatting, quarter boundaries
├── styles/
│   ├── layout.css          # Page chrome, nav, card grid
│   ├── upload.css          # Drag-and-drop upload zone
│   ├── metrics.css         # KPI cards (actuals, forecast, variance, burn rate)
│   ├── table.css           # Quarterly hours table
│   ├── chart.css           # Chart container and controls
│   ├── modal.css           # Forecast modal dialog
│   └── account.css         # User button, avatar, sign-out button
├── server/
│   ├── index.js            # Express entry — mounts auth + API routes
│   ├── db.js               # SQLite schema init, seed data, portal_user_id mapping
│   ├── projectLoader.js    # Reusable helper: load project + consultants + hours
│   ├── middleware/
│   │   └── portalAuth.js   # Local session store + handoff/callback/logout handlers
│   └── routes/
│       ├── projects.js     # CRUD: list, get, create, update, soft-delete, restore
│       ├── clients.js      # List and create clients
│       ├── consultants.js  # Set forecast hours-per-week, record manual actuals
│       └── upload.js       # Merge CSV data into existing project
├── tests/                  # Vitest unit tests
└── vitest.config.js
```

**Read before making changes:**
- `server/db.js` — owns the full schema; the `users` table now has `portal_user_id` mapping local users to portal identities
- `server/middleware/portalAuth.js` — verifies the portal session cookie and resolves `req.userId`; read this before touching auth or any route's user scoping
- `js/api.js` — owns all client-server contracts; update here whenever a route signature changes
- `js/state.js` — shared mutable state; understand what's in it before touching any module that reads from it
- `server/routes/projects.js` — most complex route file; owns soft-delete, restore, and the project data shape
- `js/chart.js` — owns the actuals/forecast bridge pattern and PDF export; non-obvious rendering logic

---

## Running Locally

```bash
npm install        # also rebuilds better-sqlite3 native bindings (postinstall)
node server/index.js
# Serves on http://localhost:3000
# data.db is auto-created in the repo root on first run
```

Run tests:
```bash
npm test           # vitest one-shot
npm run test:watch # vitest watch mode
```

---

## Database Schema

SQLite via `better-sqlite3` (synchronous). File: `data.db` (gitignored, auto-created). Path configurable via `DB_PATH` env var.

**`users`** — account holders, mirrored from portal
```
id, email (unique), name, role, portal_user_id (unique)
Seeded: austin.dircks@improving.com (portal_user_id = 1)
Auto-upserted on each authenticated request from portal's /api/me
```

**`projects`** — consulting engagements
```
id, user_id, name, description, budget, client_id, start_date, end_date, deleted_at
deleted_at IS NULL = active; soft-delete only, never hard-delete rows
```

**`clients`** — client organizations
```
id, user_id, name
Default "Costco" client exists for legacy records without a client_id
```

**`consultants`** — billable staff per project
```
id, project_id, name, hourly_rate, forecast_hours_per_week, total_billed
Unique: (project_id, name)
```

**`weekly_hours`** — time entries per consultant per week
```
id, consultant_id, week_key (YYYY-WW format), hours, from_csv (0|1)
Unique: (consultant_id, week_key)
```

`from_csv = 1` means the row came from a Workday CSV upload. Manual actuals set `from_csv = 0`. The `PUT /consultants/:id/actuals` endpoint rejects writes to CSV-origin weeks to prevent overwriting imported data.

---

## API Endpoints

All routes under `/api/`. Every request requires a valid portal session — `requirePortalAuth` middleware sets `req.userId`, and routes scope all queries by it. Unauthenticated requests get 401 (JSON) or a redirect to portal (HTML).

`GET /api/me` — returns the resolved local user + portal session info, including impersonation state.
`GET /auth/portal` — server-side 302 to `PORTAL_URL`, used by the frontend to redirect on 401.

**Projects**
```
GET    /api/projects              List active projects (deleted_at IS NULL)
POST   /api/projects              Create project {name, clientName, description?, budget?, start_date?, end_date?}
GET    /api/projects/:id          Full project with consultants + weekly_hours
PUT    /api/projects/:id          Update name, description, budget, dates, client
DELETE /api/projects/:id          Soft-delete (sets deleted_at)
POST   /api/projects/:id/restore  Clear deleted_at
```

**Clients**
```
GET  /api/clients     List all clients, alphabetically
POST /api/clients     Create client {name} — uses INSERT OR IGNORE
```

**Consultants**
```
PUT /api/consultants/:id/forecast  Set forecast_hours_per_week; bulk-writes future weeks as forecast rows
PUT /api/consultants/:id/actuals   Write manual hours for a single week; rejects if from_csv = 1 for that week
```

**Upload**
```
POST /api/upload/:projectId  Merge consultant CSV data
  - Upserts consultants (keeps higher hourly_rate on conflict)
  - Accumulates total_billed
  - Upserts weekly_hours with from_csv = 1
  - Expects body: { consultants: [{ name, hourly_rate, total_billed, weeks: { "YYYY-WW": hours } }] }
```

---

## Data Flow: CSV Upload

1. User drags a Workday CSV onto the upload zone in `project.html`
2. `csv-parser.js` parses raw text → array of row objects
3. `data-processor.js` aggregates rows by consultant and week key → normalized payload
4. `upload.js` POSTs to `/api/upload/:projectId`
5. Server merges into `consultants` and `weekly_hours` tables (upsert)
6. Frontend reloads project data, re-renders metrics / table / chart

---

## Financial Calculations (js/metrics.js)

- **Actuals:** sum of `hours × hourly_rate` for all `weekly_hours` rows where `from_csv = 1` up to the current week
- **Forecast:** sum of projected `hours × hourly_rate` for future weeks (non-CSV rows, or forecast baseline applied forward)
- **Variance:** `budget - actuals - forecast`
- **Burn rate:** configurable — spending velocity over a month or custom date range

---

## Chart Architecture (js/chart.js)

Uses Chart.js 4.4.1 (CDN). Two datasets rendered on the same axis:
- **Actuals line** (green, solid): historical weeks with CSV data
- **Forecast line** (blue, dashed): future weeks based on `forecast_hours_per_week`
- The bridge: actuals line stops at the current week; forecast line starts there — no gap, no overlap

Granularity auto-scales: weekly for short projects, monthly or quarterly for longer ones.

PDF export uses jsPDF 2.5.1 (CDN). The chart canvas must be visible in the DOM during export — if you move the chart to a hidden container, the snapshot will be blank. The current export snapshots the canvas at 800×400 to avoid this.

---

## Design System

Shared across all three apps — do not introduce new values without applying them consistently:
- Fonts: Poppins (headings), Khula (body) via Google Fonts
- Primary blue: `#005596`
- Neutral grays: `#f8f9fa`, `#e5e7eb`
- Actuals color: green (Chart.js dataset)
- Forecast color: blue dashed (Chart.js dataset)

---

## Code Style

- Vanilla HTML, CSS, and JavaScript (ES6 modules) only. No frontend framework, no bundler.
- Do not add npm packages beyond Express and better-sqlite3 without being explicitly asked. Chart.js and jsPDF are loaded via CDN, not npm.
- `const` and `let` only — never `var`.
- Named functions — no anonymous functions for anything non-trivial.
- No inline styles — CSS classes only.
- JS modules use ES6 `import`/`export`. The server uses `"type": "module"` in package.json.

---

## Constraints

- Do not add React, Vue, or any frontend framework. Intentionally vanilla.
- Auth lives in portal. Don't add credential validation, session storage, or password handling here. If the auth model needs to change, change it in portal first.
- Soft-delete is the only supported deletion pattern for projects. Do not add hard-delete routes.

---

## Known Issues / Gotchas

- **`/api/me` adds latency to every request.** Each authenticated request makes an HTTP call to portal (cached 60s per session id). If portal is slow or down, this app degrades. Acceptable for an internal tool; revisit if traffic grows.
- **N+1 query in `projectLoader.js`.** For each consultant in a project, a separate query fetches that consultant's weekly hours. Fine for current data sizes; optimize with a JOIN if projects grow large.
- **`data.db` is ephemeral on Railway.** SQLite is not persisted across redeploys unless a Railway volume is mounted. Current behavior: seed data re-inserts on cold start; uploaded project data is lost on redeploy.
- **Chart export requires visible DOM.** The jsPDF canvas snapshot fails silently if the chart container is hidden. Don't move the chart to a `display: none` element.
- **CSV parser doesn't handle all RFC 4180 edge cases.** Semicolon-delimited or unclosed-quote CSVs will produce bad parses. The parser is tuned for Workday's specific export format.

---

## Git Workflow

- Branch naming: `feature/short-description` or `fix/short-description`
- Commit messages: present-tense, imperative ("Add burn rate range selector", not "Added...")

---

## Deployment

Hosted on Railway. No Dockerfile or railway.json needed — Railway infers Node.js from `package.json` and runs `npm start` → `node server/index.js`. The `postinstall` script (`npm rebuild better-sqlite3`) rebuilds the native SQLite bindings for the Railway environment automatically.

Environment variables:
- `PORT` — set by Railway automatically (default fallback: 3000)
- `DB_PATH` — optional; defaults to `data.db` in repo root
- `PORTAL_URL` — required in prod; the portal base URL used for `/api/me` lookups and the `/auth/portal` redirect

To verify production is healthy: https://revenue-analysis-app-production.up.railway.app/
