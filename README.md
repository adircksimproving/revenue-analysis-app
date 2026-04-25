# Revenue Analysis App

A single-user web application for Improving that tracks consultant revenue by project and client. Users upload Workday billing exports, set budget targets, and view forecast vs. actuals charts with PDF export.

---

## Running the App

```bash
npm install
npm start
```

Navigate to `http://localhost:3000`. The app runs on port 3000 by default (overridable via `PORT` environment variable).

On first start, the server creates a SQLite database (`data.db`), seeds the hardcoded user (Austin Dircks / `austin.dircks@improving.com`), and creates a default "Costco" client.

**Test suite:**
```bash
npm test
```

---

## Pages

| Page | File | Purpose |
|---|---|---|
| Login | `index.html` | Entry point. Email/password form — no real auth validation, navigates to Home on submit. |
| Home | `home.html` | Dashboard showing all projects grouped by client. Create, edit, and delete projects. |
| Account | `account.html` | User profile and a dynamic list of all clients with their nested projects. |
| Project | `project.html?id={id}` | Main workspace. CSV upload, metrics, financial summary, forecast chart, consultant table, PDF export. |

---

## User Flows

### Login → Home
User submits the login form → navigates to `home.html`.

### Home: Create a Project
1. Click **+ New Project**
2. Enter project name and client name (required)
   - Client name autocompletes from existing clients; a new name creates a new client
3. Submit → project is created → browser redirects to the Project page

### Home: Edit a Project
1. Click the **⋮** menu on any project tile
2. Select **Edit project**
3. Update name and/or client in the modal
4. Save → grid reloads with updated grouping

### Home: Delete a Project
1. Click the **⋮** menu → **Delete project**
2. Confirm in the dialog → project is soft-deleted (hidden from the grid, data retained in DB)

### Project Page: Analyze Data
1. **Upload CSV** — drag and drop or click the upload zone to select a Workday "Find Billable Transactions" report
2. App parses the file, aggregates hours and revenue by consultant and week, then merges into the database
3. Page displays:
   - **Metrics bar**: total consultants, billed hours to date, amount billed to date
   - **Financial summary**: Budget (editable), Actuals, Forecast, Variance
   - **Consultant table**: one row per consultant with weekly hour cells and a forecast modal trigger
   - **Chart**: toggled by clicking the Forecast tile — shows cumulative Actuals, Forecast, and Budget lines
4. **Set Budget** — type a dollar amount in the Budget card; saved automatically with a short debounce
5. **Update Forecast** — click the forecast button on a consultant row, enter hours/week; all remaining weeks in the current quarter are populated
6. **Export PDF** — generates a PDF with metrics, financial summary, chart, and a budget-intersection callout

---

## Data Model

```
users
  id, email (UNIQUE), name, role

clients
  id, user_id → users, name
  UNIQUE(user_id, name)

projects
  id, user_id → users, client_id → clients
  name, description, budget_value
  deleted_at (NULL = active, timestamp = soft-deleted)
  created_at, updated_at

consultants
  id, project_id → projects
  name, rate, forecast_hours_per_week, billed_total
  UNIQUE(project_id, name)

weekly_hours
  id, consultant_id → consultants
  week_key (format: YYYY-MM-WX, e.g. 2025-04-W3)
  hours
  UNIQUE(consultant_id, week_key)
```

**Relationships:**
- User → Clients (1:N)
- User → Projects (1:N)
- Project → Client (N:1)
- Project → Consultants (1:N)
- Consultant → Weekly Hours (1:N)

---

## API Routes

### Clients

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/clients` | — | List all clients for the user |
| POST | `/api/clients` | `{ name }` | Find-or-create a client by name |

### Projects

| Method | Path | Body | Description |
|---|---|---|---|
| GET | `/api/projects` | — | List all active projects (includes `clientName`) |
| POST | `/api/projects` | `{ name, clientName, description? }` | Create project; finds or creates client |
| GET | `/api/projects/:id` | — | Full project with consultants and weekly hours |
| PUT | `/api/projects/:id` | `{ name?, description?, budgetValue?, clientName? }` | Update project metadata |
| DELETE | `/api/projects/:id` | — | Soft-delete |
| POST | `/api/projects/:id/restore` | — | Restore a soft-deleted project |
| POST | `/api/projects/:id/upload` | `{ consultants: [...] }` | Merge consultant/hours data from a parsed CSV |

### Consultants

| Method | Path | Body | Description |
|---|---|---|---|
| PUT | `/api/consultants/:id/forecast` | `{ forecastHoursPerWeek, weeklyHours? }` | Set forecast hours per week; populates future week rows |

---

## CSV Upload

**Expected source:** Workday "Find Billable Transactions" report, exported as `.csv`.

**Required columns** (case-insensitive):

| Column | Usage |
|---|---|
| `Worker` | Consultant name |
| `Rate to Bill` | Hourly billing rate (handles `$` and commas) |
| `Hours To Bill` | Hours worked for this row |
| `Amount to Bill` | Billed revenue for this row |
| `Transaction Date` | Used to derive the week key (`YYYY-MM-WX`) |

**Processing steps:**
1. File is read in the browser via the FileReader API
2. `parseCSV()` splits lines, handles quoted fields, maps headers case-insensitively
3. `processCSVRows()` groups rows by consultant name, aggregates hours per week, sums `billedTotal`
4. Transformed data is sent to `POST /api/projects/:id/upload`
5. Server upserts each consultant (creates if new, updates rate if > 0) and additively merges weekly hours — uploads accumulate rather than overwrite

---

## Forecast Calculation

- Each consultant has a `forecast_hours_per_week` value (default: 40)
- When a user sets a forecast, the server writes one `weekly_hours` row per remaining week in the current quarter
- **Week key format:** `YYYY-MM-WX` — week-of-month, 1-based (ceiling of day ÷ 7)
- **Forecasted revenue** = Σ (consultant rate × forecast hours per remaining week)
- **Variance** = Budget − Actuals − Forecast
- The forecast chart interpolates the date at which the cumulative forecast line crosses the flat budget line

---

## PDF Export

Triggered by the **Export PDF** button (enabled after data is loaded). Generated entirely from in-memory state — no DOM screenshots — so UI-only elements (e.g. tooltips) are never included.

**Contents:**
1. Improving logo + project name header
2. Metrics (Total Consultants, Billed Hours to Date, Amount Billed to Date)
3. Financial summary (Budget, Actuals, Forecast, Variance)
4. Cumulative revenue chart
   - Green line: Actuals (past weeks)
   - Blue dashed line: Forecast (future weeks)
   - Gray dashed line: Budget target
5. Budget-intersection callout ("Forecast meets budget around [date]"), if applicable
6. Export date footer

**File name:** `{project-name}-forecast.pdf`

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES modules), HTML5, CSS3 |
| Charts | Chart.js 4.4.1 |
| PDF | jsPDF 2.5.1 |
| Backend | Express 5.2.1 (Node.js) |
| Database | SQLite via better-sqlite3 |
| Tests | Vitest + jsdom |

---

## Project Structure

```
root/
├── index.html              Login page
├── home.html               Project dashboard
├── account.html            User profile and client list
├── project.html            Analysis workspace
├── styles/                 CSS (layout, upload, metrics, table, chart, modal, account)
├── js/
│   ├── app.js              Entry point for project.html
│   ├── api.js              Fetch-based HTTP client
│   ├── state.js            Global state object
│   ├── csv-parser.js       Raw CSV string → row objects
│   ├── data-processor.js   Row objects → consultant records; populates page state
│   ├── upload.js           File input and drag-and-drop handling
│   ├── modal.js            Forecast modal logic
│   ├── metrics.js          Financial summary and metrics rendering
│   ├── chart.js            Chart.js integration and data building
│   ├── table.js            Consultant hours table rendering
│   └── date-utils.js       Date, quarter, and week-key utilities
├── server/
│   ├── index.js            Express app setup and route mounting
│   ├── db.js               SQLite init, schema, seeding, migration
│   ├── projectLoader.js    Loads full project + consultants + hours from DB
│   └── routes/
│       ├── projects.js     Project CRUD
│       ├── clients.js      Client list and create
│       ├── upload.js       CSV merge endpoint
│       └── consultants.js  Forecast update endpoint
├── tests/                  Unit tests
├── package.json
└── data.db                 SQLite database (auto-created on first run)
```
