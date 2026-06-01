# Manager Morning Recap Emails — Design

**Date:** 2026-06-01
**Status:** Approved for planning
**Author:** Dalton + Claude

## Goal

Send each store manager a brief, personal morning email about their own
store's prior day, inviting a reply with a recap. The message must feel like a
real note from someone who looked at the numbers — never a canned template.
When a store **missed forecast AND went over scheduled hours** (the
"especially problematic" combination), that store's note shifts to a more
specific, constructive ask about what happened — still never harsh.

This is a **new, separate** channel from the existing 7:00 AM leadership
debrief (`RanchersDailyDebrief.js`), which is unchanged. The audience is
individual store managers; the leadership debrief audience is leadership.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Manager email source | MongoDB `users` collection (via the Next.js app) |
| Manager identification | Users with `dashboardAccess.type === 'specific'` |
| Multi-store recipients | **One combined email** per person, one section per store |
| Generation | **Claude-personalized** per store (reuse `ANTHROPIC_API_KEY`) |
| Relationship to leadership debrief | **Separate** trigger, runs alongside (~7:15 AM) |
| Reply destination | **Reply-To = leadership distro** |
| Numeric detail | **Light** — figures woven into the prose, no table/stat strip |
| Per-store recipient management | Existing **admin/users** screen (location access) |
| Always-copy list | **Visible CC**, stored in Script Property `MANAGER_RECAP_CC` |
| Send audit trail | **`Manager Recap Log`** spreadsheet tab, full email body captured |

## Architecture

Apps Script–centric, because the per-store performance data (sales vs forecast,
scheduled vs actual hours, forecast streaks, auto-clockouts), the computation
logic, the Claude wiring, and the email-sending all already live in Apps
Script. The only missing input is the store→manager mapping, which lives in
MongoDB and is reachable only by the Next.js app. A thin HTTP bridge supplies
it.

```
6:30 AM  processAllR365Rreports.js   (ingest — unchanged)
7:00 AM  RanchersDailyDebrief.js     (leadership debrief — unchanged)
7:15 AM  RanchersManagerRecap.js     (NEW — manager emails)
              |
              | UrlFetchApp GET (Bearer MANAGER_SYNC_TOKEN)
              v
         pages/api/store-managers.js  (NEW — returns roster from MongoDB)
```

### Component 1 — `pages/api/store-managers.js` (NEW)

- **Purpose:** Return the manager roster so Apps Script can map stores to people.
- **Auth:** Bearer token in the `Authorization` header, compared against
  `process.env.MANAGER_SYNC_TOKEN`. No NextAuth session (the caller is a
  server-to-server script). Reject with 401 if the token is missing/wrong.
- **Method:** `GET` only (405 otherwise).
- **Behavior:** Query `db.collection('users')` for users where
  `dashboardAccess.type === 'specific'` and `dashboardAccess.locations` is a
  non-empty array. Return:
  ```json
  { "managers": [ { "name": "Jane D.", "email": "jane@rancherscustard.com", "locations": ["Bixby"] } ] }
  ```
- **Dependency:** `lib/mongodb` (existing `clientPromise`).
- **Env:** `MANAGER_SYNC_TOKEN` added to Vercel project env (all environments).

### Component 2 — `apps-script/RanchersManagerRecap.js` (NEW)

Lives in the same single Apps Script project as the other five files, so it can
call the existing globals directly. **Reuses, does not duplicate:**
`buildDailyLocationData`, `getClockoutCounts`, `buildForecastStreaks`,
`getMarket`, `getYesterdayStr`, `fmtDisplayDate`, the Claude API helper, and the
`DAILY_CONFIG` constants (`LABOR_COST_PER_HR`, `BUYING_SALES_PCT`, etc.).

Config (new `RECAP_CONFIG` block):
- `MANAGER_API_URL` — the deployed `/api/store-managers` URL.
- `REPLY_TO` — the leadership distro string (same list as
  `DAILY_CONFIG.RECIPIENTS`).
- `SEND_HOUR: 7`, plus a minute offset so the trigger fires ~7:15.
- `MANAGER_SYNC_TOKEN` read from Script Properties (not hardcoded).
- `MANAGER_RECAP_CC` read from Script Properties — comma-separated list of
  addresses **visibly CC'd on every** manager email (initially Josh, Eric,
  Kandace). Editable in the Apps Script Project Settings UI with no code change
  or `clasp push`. Parsed/trimmed at runtime; empty or unset → no CC.

Flow (`sendManagerRecaps()`):
1. Build yesterday's per-store data via the existing helpers (sales,
   forecastVariance, scheduled hours, actual hours, prior year, streaks,
   auto-clockouts).
2. Fetch the manager roster via `UrlFetchApp` with the Bearer token. On
   non-200, log and abort (do not send anything).
3. Group by recipient email → list of that person's stores (intersection of
   their `locations` with stores that have data for yesterday).
4. For each recipient, build a combined HTML email: a short personal greeting
   using their first name, then one Claude-written section per store.
5. Set the per-store **escalation flag** = `missed forecast AND over scheduled
   hours` (same condition the leadership debrief uses). Pass it to Claude so
   that store's section asks specifically and constructively about the day and
   the staffing call. Stores in `NEW_STORES` are never escalated and get
   gentler, context-first framing.
6. Send one email per recipient with `MailApp.sendEmail` using
   `replyTo: RECAP_CONFIG.REPLY_TO` and `cc: RECAP_CONFIG.MANAGER_RECAP_CC`
   (visible CC, applied to every outbound email).
7. Append one row per recipient to the `Manager Recap Log` tab (see below), and
   log per-recipient send results to the execution log.

A `setupManagerRecapTrigger()` (run once) installs the time-based trigger, and a
`testManagerRecaps()` previews to `dalton@rancherscustard.com` without emailing
real managers — mirroring the existing debrief's setup/test pattern.

## Recipient management (no code edits required)

Two independent, editable controls — neither needs a developer:

1. **Per-store managers** (the people who move around): governed entirely by the
   existing **admin/users** screen. A manager's emails are derived from their
   `dashboardAccess.locations`, so:
   - *Move a manager* (Bixby → Owasso): edit their location access; the recap
     follows on the next run.
   - *Add a second recipient to a store*: give that person specific dashboard
     access to that store.
   - *Stop emailing someone*: remove their specific location access.
2. **Always-copy list** (leadership copied on everything): the Script Property
   `MANAGER_RECAP_CC`, edited in the Apps Script Project Settings UI. Initially
   Josh, Eric, Kandace. Visible CC on every manager email.

**Volume note:** because each manager gets an individual email, a visible CC
means each leadership address on `MANAGER_RECAP_CC` receives one copy per
manager email — roughly one per staffed store each morning (~15–20). This is
the intended "copied on all outbound" behavior, noted here so the inbox volume
is expected.

## Send audit trail — `Manager Recap Log` tab

After each send the script appends one row per recipient to a `Manager Recap
Log` tab in the dashboard spreadsheet (auto-created with a bold header row on
first run, mirroring the existing debrief logging helper). Columns:

| Column | Contents |
|--------|----------|
| Timestamp | When the row was written |
| Date | The prior day the recap covers |
| Recipient Name | From the roster |
| Recipient Email | The To: address |
| Stores | The store sections included in that email |
| CC | The `MANAGER_RECAP_CC` addresses copied |
| Status | `Sent` or `Failed: <reason>` |
| Email Body | The exact HTML/text the recipient received |

This makes "who was it sent to, and what did it say" answerable by opening the
tab — no execution-log spelunking. `testManagerRecaps()` writes preview rows
marked `Preview` in the Status column so test runs are distinguishable from
real sends.

## Email content & tone

- **Light detail:** Claude weaves the figures (sales, vs forecast $ and %, vs
  prior year, hours vs **scheduled**) into natural prose. No table, no stat
  strip.
- **Structure per store:** opens conversationally, states how the day went in
  plain language, then invites a reply with a quick recap of yesterday.
- **One store per section.** Never group stores into comma-separated lists.
- **Tone rules (inherited from CLAUDE.md):** constructive, never harsh; dynamic,
  non-repetitive wording across stores and across days; no grades surfaced.
- **Escalation case:** for a store that missed forecast AND ran over scheduled
  hours, the note still opens warmly but asks a specific, blame-free question
  about what drove softer sales and how the staffing decision played out
  ("worth looking into," "help me understand the day").
- **New/ramp-up stores** (`NEW_STORES`, currently Claremore): context-first,
  encouraging, never escalated.

## Error handling

- Roster fetch fails or returns non-200 → log and abort the whole run (better to
  send nothing than to send a broken or empty batch).
- A store in a manager's `locations` has no data for yesterday → omit that
  section silently.
- A recipient ends up with zero stores that have data → skip that recipient.
- Claude API error for a section → fall back to a brief plain-prose summary
  built from the numbers, so the manager still gets a usable note.
- Each recipient send wrapped in try/catch so one failure doesn't halt the
  batch; a failure still writes a log row with `Status = Failed: <reason>`.

## Testing

- `testManagerRecaps()` previews the full batch to `dalton@` only, with the
  intended recipient labeled in the body, so output can be reviewed before going
  live.
- Verify: combined email correctly merges a multi-store recipient; escalation
  wording triggers only on missed-forecast-AND-over-scheduled; new stores never
  escalate; Reply-To is the leadership distro; the `MANAGER_RECAP_CC` addresses
  appear as a visible CC; a missing-data store is omitted cleanly.
- Verify the `Manager Recap Log` tab: header auto-created on first run, one row
  per recipient with the full body captured, preview runs marked `Preview`, and
  a forced send failure records a `Failed` row.
- The `/api/store-managers` route: unit-check that a bad/missing token returns
  401 and a valid token returns only `type === 'specific'` users.

## Out of scope

- Editing the leadership debrief.
- Storing or threading manager replies anywhere beyond the leadership inbox.
- A new email provider — sending stays on `MailApp` in Apps Script.
- Any UI for managing the roster (reuses the existing admin/users screen).

## Deployment notes

- Add `MANAGER_SYNC_TOKEN` to Vercel env and to Apps Script Script Properties
  (same value).
- Add `MANAGER_RECAP_CC` Script Property (comma-separated), initially Josh, Eric,
  Kandace. Editable later in Project Settings with no code push.
- After editing Apps Script files: `clasp push` (committing to Git does NOT
  deploy — per CLAUDE.md).
- Run `setupManagerRecapTrigger()` once in the live editor to install the 7:15
  trigger.
