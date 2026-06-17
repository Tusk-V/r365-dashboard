# Andy's Dashboard — Knowledge Base

> Onboarding & reference for new collaborators. This doc deliberately contains
> **no passwords, keys, or secrets** — see [Secrets & access](#secrets--access)
> for where those actually live.

---

## 1. What this is

**Andy's Dashboard** ([andysdashboard.com](https://andysdashboard.com)) is a
custom multi-location restaurant operations platform for **Ranchers Custard
Company** (Andy's Frozen Custard). It serves **~20 locations across 4 markets**:
Tulsa, Oklahoma City, Dallas, and Orlando.

It delivers:

- **Daily & weekly operational dashboards** (sales, labor, overtime, forecasting, logbook, paid-outs, scheduled-today, call-offs, clockouts)
- **AI-generated debrief emails** (daily + weekly) written via the Claude API
- **P&L reporting** from R365 Excel exports
- **Manager bonus calculations**
- **A self-learning sales forecast model**
- **An internal messaging/chat system** for managers and associates
- **Manager recap emails** with an editable roster

**Repo:** [`Tusk-V/r365-dashboard`](https://github.com/Tusk-V/r365-dashboard)
**Hosting:** Vercel (team: `daltons-projects-c3po2d5p`)
**Admin / primary contact:** dalton@rancherscustard.com

---

## 2. The big mental model

This project is **two separate codebases living in one repo**, with **two
separate sources of truth**:

```
r365-dashboard/
├── pages/, components/, lib/, styles/   ← Next.js web app  → deployed by Vercel
└── apps-script/                          ← Google Apps Script backend → deployed by clasp
```

| | Next.js web app | Apps Script backend |
| --- | --- | --- |
| **Lives in** | repo root | `apps-script/` |
| **Deploys via** | Vercel (auto on push to `main`) | `clasp push` (manual) |
| **Runs** | the dashboards users see | the 6:30 AM data pipeline & debrief emails |
| **Source of truth** | this Git repo | the **live Apps Script editor** |

> ⚠️ **The single most important gotcha in this project** is that committing
> Apps Script changes to Git does **not** deploy them. See
> [Apps Script sync workflow](#5-apps-script-sync-workflow-critical).

---

## 3. Stack

- **Frontend:** Next.js 14, React 18, Tailwind CSS (dark slate design system), Lucide icons
- **Auth:** NextAuth with Google OAuth, **restricted to `@rancherscustard.com`** accounts
- **Database:** MongoDB (database name: `andysdashboard`)
- **File storage:** Vercel Blob (`@vercel/blob`) for P&L uploads
- **Email:** Nodemailer (SMTP) for transactional mail; debrief emails are sent from Apps Script
- **Push:** Web Push (VAPID) + Pusher for realtime chat
- **Backend automation:** Google Apps Script (clasp-managed), R365 OData API, Google Sheets
- **AI:** Claude API (debrief generation)
- **Deploy:** Vercel; Apps Script triggers for scheduled jobs

---

## 4. Repo layout

### Web app (Next.js, repo root)

| Path | What's there |
| --- | --- |
| `pages/index.js` | Main dashboard shell + the tabbed dashboard views |
| `pages/pl.js`, `pages/pl-upload.js` | P&L dashboard + Excel upload |
| `pages/bonus.js` | Manager bonus calculator |
| `pages/messages.js` | Internal chat |
| `pages/admin/` | Admin: `index.js`, `users.js`, `recap-roster.js` |
| `pages/api/` | API routes — auth, chat, cron, PL, bonus, sheets-proxy, admin, sync-users |
| `components/dashboards/` | One file per dashboard tab (DailySales, WeeklySales, DailyLabor, Overtime, Forecasting, Logbook, PaidOuts, ScheduledToday, CallOffs, Clockouts) |
| `components/chat/`, `components/modals/`, `components/shared/` | Chat UI, modals, shared widgets |
| `lib/` | Pure helpers — see below |
| `tests/` | `node --test` suite (run with `npm test`) |

**Key `lib/` modules:**

- `lib/channels.js` — **single source of truth** for markets, locations, and chat channels. `LOCATION_MARKETS`, `MARKETS`, slug/channel helpers, and the dashboard-vs-associate access logic all live here.
- `lib/markets.js` — `getMarket` / `sortByMarket` (re-exports market data from `channels.js`)
- `lib/dashboardAccess.js` — server-side gate: who can see dashboard data (owners, FOMs, market/store managers = yes; associates = no)
- `lib/forecast.js`, `lib/laborGrade.js` — forecast + labor grading helpers used by the UI
- `lib/mongodb.js` — shared MongoClient promise
- `lib/push.js` — web-push helpers
- `lib/storeManagers.js`, `lib/dailyCard.js`, `lib/sheetParsers.js`, `lib/timezone.js`, `lib/contentFilter.js`, `lib/audit.js`, `lib/logbookHelpers.js`, `lib/avatarColor.js`

### Apps Script backend (`apps-script/`)

All ten files belong to **ONE** Apps Script project:

| File | Role |
| --- | --- |
| `processAllR365Rreports.js` | **Main ingestion** — parses R365 report emails into the Google Sheet (6:30 AM trigger) |
| `RanchersDailyDebrief.js` | Daily AI debrief email (7:00 AM, depends on the 6:30 processor) |
| `RanchersWeeklyDebrief.js` | Weekly AI debrief email (Mondays) |
| `RanchersManagerRecap.js` | Manager recap emails |
| `Modelforecast.js` | The self-learning forecast model |
| `ModelDiagnostics.js` | Forecast model diagnostics |
| `ForecastWeather.js` | Per-location coordinates + weather inputs to the forecast |
| `R365OData.js` | R365 OData API client |
| `RestaurantSignals.js`, `SportsEvents.js` | Demand signals (events, etc.) feeding the model |

> These are stored locally as `.js`; clasp converts them to `.gs` on push.

### Docs

- `CLAUDE.md` — the canonical operating manual (read this next; it's the deepest source on conventions)
- `docs/superpowers/specs/` & `docs/superpowers/plans/` — design specs and implementation plans for past/in-flight features (recap roster, messaging, multi-tenant platform, etc.)

---

## 5. Apps Script sync workflow (CRITICAL)

The live Apps Script editor and this Git repo are **separate sources of truth**.
The 6:30 AM processor and 7:00 AM debrief triggers run against whatever is
**LIVE in the editor**, not against this repo. **Committing to Git deploys
nothing.**

Standing loop for any backend edit:

```bash
clasp pull        # 1. reconcile local with what's currently live
                  #    (the editor and morning triggers may have changed things)
# 2. edit the file(s) in apps-script/
git commit ...    # 3. version history
clasp push        # 4. DEPLOY local edits to the live Apps Script project
```

**The trap to avoid:** editing locally, committing to Git, and never running
`clasp push` — the repo looks correct but the live debrief runs stale code.

Notes:

- `.clasp.json` (links local dir → script project) and `~/.clasprc.json` (OAuth creds) are **gitignored** and must stay that way.
- Don't edit `apps-script/appsscript.json` unless you're deliberately changing project settings — `clasp push` sends it back and an accidental edit changes live config.

---

## 6. Markets & locations

Source of truth: [`lib/channels.js`](../lib/channels.js).

- **Tulsa:** Bixby, Yale, Broken Arrow, Owasso, Claremore
- **Oklahoma City:** Warr Acres, Penn, Edmond, Norman
- **Dallas:** Carrollton, Frisco #1, Frisco #2, Frisco #3, The Colony, Hillcrest Village, Lake Highlands, Allen, Prosper
- **Orlando:** Sanford, Lakeland, Hunter's Creek

**Operational lists to know:**

- **Watch list:** Allen, Frisco #3 — escalated in debriefs only if they miss forecast **and** go over scheduled hours.
- **Ramp-up stores:** Hunter's Creek, Claremore — excluded from harsh critique; context goes in Notes, not Problems. Removed from `NEW_STORES` after ~2 months.

### Adding a new location (the 6-file pattern)

Adding a location requires edits to **exactly these files**, delivered together:

1. `pages/index.js` — market array
2. `pages/admin/users.js` — `ALL_LOCATIONS` (keep alphabetical)
3. `apps-script/ForecastWeather.js` — coordinates + market
4. `apps-script/Modelforecast.js` — locations array
5. `apps-script/RanchersDailyDebrief.js` — market array (+ `NEW_STORES` if ramp-up)
6. `apps-script/RanchersWeeklyDebrief.js` — market array (+ `WEEKLY_NEW_STORES` if ramp-up)

`processAllR365Rreports.js` needs **no change** — it discovers locations
dynamically from email contents. Remember to `clasp push` after editing the
Apps Script files.

---

## 7. Daily data pipeline & timing

```
6:30 AM  processAllR365Rreports.js   → ingest R365 report emails into the Sheet
7:00 AM  RanchersDailyDebrief.js     → AI daily debrief email (needs 6:30 done)
Mondays  RanchersWeeklyDebrief.js    → AI weekly debrief email
```

Plus Vercel cron (in `vercel.json`):

- `/api/cron/daily-cards` at **12:00 & 13:00 UTC** — generates the daily summary cards.

The web app reads the Google Sheet (refreshing every ~5 min while open) and
MongoDB; it does not run the ingestion itself.

---

## 8. Domain logic worth knowing

These rules are encoded across the app and the debrief scripts — keep them in
mind before "fixing" something that looks off.

### Labor metrics hierarchy

- **Primary metric:** Actual vs. **Scheduled** hours (what management committed to).
- **Secondary:** Optimal hours — an aspirational benchmark, *not* the standard.
- A store that **beats forecast is never placed in "Problems,"** regardless of labor.
- **Efficiency warning:** flag when excess scheduled labor cost exceeds 20% of the sales gain (`BUYING_SALES_PCT = 0.20`, `LABOR_COST_PER_HR = 17`).
- **Auto-clockouts** mean reported hours are *overstated* — the real labor picture is **better** than it looks, not worse.

### Forecasting model

- **Prior-week sales** is the primary baseline; the **4-week average** is secondary.
- Holidays, spring break, and "halo" days (Friday before, Monday after) are excluded from coefficient tuning. Spring-break config: `MODEL_CONFIG.SPRING_BREAK`.
- Future forecast rows without actuals are deleted and regenerated each daily run with the latest coefficients.

### Debrief tone rules

- Constructive, never harsh ("needs attention," "worth looking into," "opportunity to tighten up").
- Dynamic, non-repetitive wording — never reuse phrasing/structure across bullets.
- **One bullet per store**; never group stores into comma-separated lists.
- New/ramp-up stores go in **Notes** with context, not Problems.
- The closing line in Notes is a plain sentence, never a bullet.

### P&L dashboard

- A single R365 Excel upload populates all three tabs (Current/Prior-Year Period, Period/YTD, YTD/Prior-YTD) from columns **B, E, I, L**.
- Store View ↔ Market View toggle does client-side roll-up aggregation.
- Always defaults to the most recently uploaded file.

### Access model

- Auth is Google OAuth, **hard-restricted to `@rancherscustard.com`** (`pages/api/auth/[...nextauth].js`).
- **Dashboard users:** owners, FOMs, market managers, store managers.
- **Associates:** chat-only — they get a **403** from dashboard data endpoints (the client-side redirect is *not* the security boundary; `lib/dashboardAccess.js` enforces it server-side).
- **Admin:** `dalton@rancherscustard.com`.

---

## 9. R365 OData notes

- **Endpoint:** subdomain `andys.restaurant365.com`; auth is HTTP Basic with a `domain\username:password` credential, base64-encoded.
- The OData service account is the `claude` user; its credentials live in Apps Script **Script Properties** (`ODATA_USERNAME`, etc.) — never in this repo.
- `payrollID` must be zero-padded to 5 digits to match the APS Employee #.
- **SalesDetail:** fetch **one day at a time** (multi-day requests cause 500 errors). `LaborDetail` handles date ranges fine.
- **Date filters:** ISO format, with the end date set to the desired last day **+ 1**.

---

## 10. Local development

```bash
npm install
npm run dev      # Next.js dev server on http://localhost:3000
npm run build    # production build
npm test         # node --test suite in tests/
```

You'll need a `.env.local` with the variables in
[Secrets & access](#secrets--access). For the Apps Script side you'll need
`clasp` installed and authenticated (`clasp login`), plus a `.clasp.json`
pointing at the project — ask Dalton for both.

---

## 11. Secrets & access

**No secret values are in this document or this repo.** `.env.local` and all
clasp credentials are gitignored. Production values live in **Vercel project
settings**; Apps Script values live in **Script Properties**.

Environment variables the app expects (names only — get the values from Vercel
or from Dalton):

| Variable | Purpose |
| --- | --- |
| `MONGODB_URI` | MongoDB connection string |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | NextAuth session config |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_SECRET` | Google OAuth |
| `GOOGLE_SHEETS_API_KEY`, `GOOGLE_SHEET_ID` | Sheets read access + target sheet |
| `PUSHER_APP_ID`, `PUSHER_KEY`, `PUSHER_SECRET`, `PUSHER_CLUSTER` | Realtime chat |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push |
| `MANAGER_SYNC_TOKEN` | Auth for the manager-sync endpoint |
| `EMAIL_FROM`, `EMAIL_SERVER_HOST`, `EMAIL_SERVER_PORT`, `EMAIL_SERVER_USER`, `EMAIL_SERVER_PASSWORD` | SMTP |

Apps Script side (in Script Properties, not env): `ODATA_USERNAME` and the OData
password, plus the Claude API key used for debrief generation.

**To get access, ask Dalton for:**

1. A `@rancherscustard.com` Google account (auth is domain-locked).
2. Vercel team access (`daltons-projects-c3po2d5p`) for env vars + deploys.
3. clasp auth + `.clasp.json` if you'll touch the Apps Script backend.

---

## 12. Conventions / working style

- **Deliver complete files**, not diffs, for frontend work (`index.js` etc.). Don't reformat existing dashboards unless asked.
- **Surgical, minimal edits** for Apps Script unless a full rewrite is requested.
- **Validate before handing off:** check JSX/JS brace/bracket balance.
- Navigate the large JS files with `grep -n` + location-specific terms.
- After any Apps Script edit: **`clasp push`** (see §5).

---

*Start with this doc, then read [`CLAUDE.md`](../CLAUDE.md) for the deepest
detail on conventions and edge cases.*
