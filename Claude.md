# Project: [Revenue Analysis App]

## Overview
This app allows Delivery Managers to see their current project spend (based on Workday data), forecast project spend, and determine burn rate via a series of inputs and calcs.

## Internal App Ecosystem

These three apps share a common auth layer (portal) and serve overlapping users (delivery managers, project managers, consultants). Before changing anything related to routing, authentication, user identity, or shared data — read the relevant files in the repo that owns that concern.

| Repo | Local Path | Role |
|---|---|---|
| `portal` | `/Users/austin.dircks/Documents/projects/internal/portal` | Auth and routing hub — handles login and redirects users to other apps |
| `revenue-analysis-app` | `/Users/austin.dircks/Documents/projects/internal/revenue-analysis-app` | Tracks project financials — billed hours per consultant, project spend forecasting |
| `consultant-directory-app` | `/Users/austin.dircks/consultant-directory-app` | Search and directory — find consultants and view their work and contact info |

### How to reference sibling repos

Start a session with access to one or more sibling repos:
```bash
claude --add-dir /Users/austin.dircks/Documents/projects/internal/portal
claude --add-dir /Users/austin.dircks/Documents/projects/internal/portal --add-dir /Users/austin.dircks/Documents/projects/internal/revenue-analysis-app
```

Add a repo mid-session without restarting:
```
/add-dir /Users/austin.dircks/Documents/projects/internal/portal
```

Or reference a specific file directly by path without any setup:
"Read /Users/austin.dircks/Documents/projects/internal/portal/auth.js before updating the login flow."

### Cross-repo rules

- Auth and session handling is owned by `portal`. Before touching anything login-related, read how portal handles auth and follow the same patterns.
- Consultant identity (IDs, names, contact fields) may appear in both `revenue-analysis-app` and `consultant-directory-app`. If changing a consultant data shape, check both repos for impact.
- Do NOT modify files in sibling repos unless explicitly asked.
- If a change here requires a follow-up in another repo, say so at the end of your response: "Follow-up needed in [repo]: [what and where]."

---

## This Repo: Structure & Key Files

```
[fill in your directory structure]
```

Key files to read before making broad changes:
- `[path/to/main entry]` — [what it does]
- `[path/to/any shared config]` — [what it controls]

---

## Commands

```bash
# Run locally
[e.g. open index.html directly, or: npx live-server]
```

---

## Code Style

- Vanilla JS and HTML — no frameworks, no build step unless noted above.
- MUST NOT introduce npm packages, bundlers, or framework dependencies without being explicitly asked.
- Use `const` and `let`, never `var`.
- Keep functions small and named clearly — avoid anonymous functions for anything non-trivial.
- No inline styles — use CSS classes.
- [Add any project-specific conventions here]

---

## Constraints

- MUST NOT add framework dependencies (React, Vue, etc.) — this is intentionally vanilla JS.
- NEVER modify portal's auth logic from within this repo — changes to auth belong in `portal`.

---

## Git Workflow

- Branch naming: `feature/short-description` or `fix/short-description`
- Commit messages: short, present-tense (e.g. "Add consultant search filter")

---

## Notes for Claude

- When in doubt about how auth or routing works, read portal first.
- Prefer small, targeted edits. Write a plan before making changes that touch multiple files.