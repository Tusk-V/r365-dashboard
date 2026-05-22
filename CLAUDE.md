# CLAUDE.md — Andy's Dashboard

Project-wide instructions for Claude Code. Read on every session.

## What this project is

Andy's Dashboard (andysdashboard.com) is a custom multi-location restaurant
operations platform for Ranchers Custard Company (Andy's Frozen Custard). It
serves ~20 locations across four markets: Tulsa, OKC, Dallas, and Orlando.

It integrates Restaurant365 (R365), Google Sheets, Google Apps Script, MongoDB,
and the Claude API to deliver daily/weekly operational dashboards, AI-generated
debrief emails, P&L reporting, manager bonus calculations, and a self-learning
sales forecast model.

**Stack:** Next.js, MongoDB, NextAuth (Google OAuth, restricted to
@rancherscustard.com), Tailwind CSS (dark slate design system), Google Apps
Script, R365 OData API, Claude API, Vercel deployment.

**Repo:** Tusk-V/r365-dashboard — **Hosting:** Vercel (team: daltons-projects-c3po2d5p)

## Repo layout

- Next.js frontend lives at the repo root (`pages/`, `styles/`, etc.).
- Apps Script backend is cloned via clasp into `apps-script/`. These are the
  live backend scripts, represented locally as `.js` (clasp converts them back
  to `.gs` on push). All six files are in ONE Apps Script project.

## Apps Script sync workflow (IMPORTANT)

The live Apps Script editor and this Git repo are SEPARATE sources of truth.
The 6:30 AM processor and 7:00 AM debrief triggers run against whatever is LIVE
in the editor, NOT against this repo. Committing to Git does NOT deploy anything.

Standing loop for any backend edit:

1. `clasp pull` — reconcile local with whatever is currently live (the editor
   and/or morning triggers may have changed things).
2. Edit the file(s) in `apps-script/`.
3. `git commit` — for version history.
4. `clasp push` — deploy local edits to the live Apps Script project.

The trap to avoid: editing locally, committing to Git, and never running
`clasp push` — the repo looks correct but the live debrief runs stale code.

`.clasp.json` (links local dir to the script project) and `~/.clasprc.json`
(OAuth credentials) are gitignored and must stay that way. Do not edit
`apps-script/appsscript.json` unless deliberately changing project settings —
`clasp push` sends it back and an accidental edit changes live project config.

## Markets & locations

- **Tulsa:** Bixby, Yale, Broken Arrow, Owasso, Claremore
- **OKC:** Warr Acres, Penn, Edmond, Norman
- **Dallas:** Carrollton, Frisco #1, Frisco #2, Frisco #3, The Colony,
  Hillcrest Village, Lake Highlands, Allen, Prosper
- **Orlando:** Sanford, Lakeland, Hunter's Creek

**Watch list:** Allen, Frisco #3 — escalate to Problems in debriefs ONLY if they
miss forecast AND go over scheduled hours.

**Ramp-up stores:** Hunter's Creek, Claremore — exclude from harsh critique;
place context in Notes, not Problems. Remove from NEW_STORES after ~2 months.

## Working style (IMPORTANT)

- **High-trust, minimal-instruction.** Don't ask clarifying questions on
  established patterns. Execute completely.
- **Always deliver complete files.** No partial snippets or diffs for `index.js`
  or other frontend files. Never reformat existing dashboards unless explicitly
  instructed.
- **Surgical edits for Apps Script.** Backend script changes should be targeted
  and minimal unless a full rewrite is requested.
- **Validate before delivering.** Run JSX/JS brace/bracket balance checks before
  handing off frontend files.
- **File navigation:** Use `grep -n` with location-specific terms to navigate
  large JS files.

## The 6-file location-add pattern

Adding a new location requires edits to EXACTLY these files. Deliver all in one
batch. (Backend files live under `apps-script/`.)

1. `pages/index.js` — market array
2. `pages/admin/users.js` — `ALL_LOCATIONS` (must stay alphabetical)
3. `apps-script/ForecastWeather.js` — coordinates + market
4. `apps-script/Modelforecast.js` — locations array
5. `apps-script/RanchersDailyDebrief.js` — market array (+ `NEW_STORES` if ramp-up)
6. `apps-script/RanchersWeeklyDebrief.js` — market array (+ `WEEKLY_NEW_STORES`
   if ramp-up)

`apps-script/processAllR365Rreports.js` (the R365 Consolidated Processor)
requires NO changes — it processes locations dynamically from email contents.

After editing backend files, remember to `clasp push` to deploy.

## Debrief tone rules

Constructive, never harsh. Use language like "needs attention," "worth looking
into," "opportunity to tighten up." Wording must be dynamic and non-repetitive
across bullets — never reuse phrasing or structure. One bullet per store; never
group stores into comma-separated lists. The closing line in Notes is always a
plain sentence, never a bullet. New/ramp-up stores go in Notes with context, not
Problems.

## Labor metrics hierarchy

- **Primary:** Actual vs. Scheduled hours (what management committed to)
- **Secondary:** Optimal hours (aspirational benchmark, not the standard)
- A store that beats forecast is NEVER placed in Problems regardless of labor.
- **Efficiency warning:** flag if excess scheduled labor cost exceeds 20% of the
  sales gain (`BUYING_SALES_PCT = 0.20`, `LABOR_COST_PER_HR = 17`).
- **Auto-clockouts** mean reported hours are overstated — the actual labor
  picture is BETTER than it appears, not worse.

## Forecasting model

- Prior week sales is the primary baseline; 4-week average is secondary.
- Holidays, spring break, and halo days (Friday before, Monday after) are
  excluded from coefficient tuning. Spring break config is in
  `MODEL_CONFIG.SPRING_BREAK`.
- Future forecast rows without actuals are deleted and regenerated each daily run
  with the latest coefficients.

## P&L dashboard

- Single Excel upload from R365 populates all three tabs (Current/Prior Year
  Period, Period/YTD, YTD/Prior YTD) from columns B, E, I, L.
- Store View and Market View toggle with client-side roll-up aggregation.
- Always defaults to the most recently uploaded file.

## R365 OData notes

- **Auth:** `andys\username:password` base64-encoded; subdomain
  `andys.restaurant365.com`
- **OData user:** `claude` — credentials in Script Properties as
  `ODATA_USERNAME = andys\claude`
- `payrollID` requires zero-padding to 5 digits to match APS Employee #
- **SalesDetail:** fetch one day at a time (multi-day causes 500 errors).
  LaborDetail handles ranges.
- **Date filters:** ISO format with end date = desired last day + 1

## Pipeline timing

- `apps-script/processAllR365Rreports.js` — main ingestion, 6:30 AM trigger
- `apps-script/RanchersDailyDebrief.js` — 7:00 AM, depends on the 6:30 processor
  completing
- `apps-script/RanchersWeeklyDebrief.js` — Mondays

## Key recipients

dalton@, josh@, eric@, kandacegiles@, steve@ — all @rancherscustard.com.
Admin: dalton@rancherscustard.com.

## Spreadsheet ID

`1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20`

## Output

Deliver completed files for download / commit. Build complete files, not diffs,
for frontend work.
