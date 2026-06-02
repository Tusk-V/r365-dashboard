# Historical Data feature — Design

**Date:** 2026-06-02
**Author:** Dalton + Claude
**Status:** Approved (design); pending implementation plan

## Problem

The dashboard frontend already reads a Google Sheets tab called **"Historical Data"**, but that
tab does not exist in the live workbook (`1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20`) and nothing
writes it. As a result the "past weeks" feature is dark — the weeks dropdown comes back empty.

Two frontend reads depend on the tab (`pages/index.js`):

- `loadAvailableWeeks()` (~line 267) reads `Historical Data!A2:A` — column A = week-ending date
  labels, used to populate the historical-week dropdown. Sorted descending by `new Date(label)`.
- `loadHistoricalWeek(weekDate)` (~line 289) reads `Historical Data!A2:K`, filters client-side by
  `row[0] === weekDate`, and parses each row via `parseHistoricalData` in `lib/sheetParsers.js`.

Both reads go through `pages/api/sheets-proxy.js` (server-side, session-gated, read-only API key).
Because the key is read-only, the tab must be created and written from **Apps Script** (clasp
workflow), not the Next app.

## Guiding constraint

**Nothing breaks.** This is purely additive. The change creates a new tab, adds a new function,
and adds one call inside an existing branch. It does not modify `Sheet1`, any other existing sheet,
the frontend, or the existing processing logic. The archive write is wrapped in its own try/catch so
a failure there can never abort the rest of the 6:30 AM processor.

## The A–K schema (consumer contract)

Defined by `parseHistoricalData` in `lib/sheetParsers.js`. One row per location per week. Row 1 is a
header; data starts at row 2.

| Col | Field              | Source (Sheet1 0-indexed column)        | Render |
|-----|--------------------|-----------------------------------------|--------|
| A   | Week Ending        | stamped (most recent Sunday)            | M/d/yyyy date string |
| B   | Location           | Location Name (0)                       | string |
| C   | Actual Sales       | Total Act Net Sales (7)                 | currency |
| D   | Forecast Sales     | For Net Sales (6)                       | currency |
| E   | Sales Variance     | For v Act Sales Var (8)                 | currency |
| F   | PY Sales           | PYSales (9)                             | currency |
| G   | Labor %            | Labor Percent (10)                      | percent |
| H   | Optimal Hours      | Opt Labor Hrs (12)                      | hours |
| I   | Actual Hours       | Act Labor Hrs (13)                      | hours |
| J   | Scheduled Hours    | Sch Labor Hrs (15)                      | hours |
| K   | Sch v For Labor Var| Sch v For Labor Var (18)                | hours |

The archive is an exact column-projection of **Sheet1** (the "Weekly Sales & Labor" summary written
by `processWeeklyData` in `apps-script/processAllR365Rreports.js`). Every field except A already
lives in Sheet1's in-memory rows. Column K (Sch v For Labor Var) exists in Sheet1 but is **not**
derivable from the Flash daily sheets — which is why Sheet1, not the Flash aggregation, is the source.

### Value-rendering note (critical)

`sheets-proxy.js` calls the Sheets `values` endpoint with **no `valueRenderOption`**, so Google
defaults to `FORMATTED_VALUE`. The frontend therefore receives display strings like `"$12,345.67"`
and `"23.45%"`, which `parseNumber`/`parsePercentage` strip. Labor % in Sheet1 is stored as a
fraction (e.g. `0.2345`) with a `0.00%` number format so its `FORMATTED_VALUE` is `"23.45%"`.

To keep the existing parsers correct, the archive must reproduce the **same formatted strings**.
The producer therefore copies both the **values** and the **number formats** from Sheet1's source
columns into the corresponding Historical Data columns, guaranteeing identical `FORMATTED_VALUE`
output regardless of the underlying representation.

## Core decision: when to archive

`processWeeklySalesLabor` ingests a different report depending on the day:

- **Tue–Sun:** the *Current Week* report → Sheet1 = the in-progress (partial) week.
- **Monday:** the *Previous Week* report → Sheet1 = the finalized, completed week.

Therefore the archive is written **only on the Monday run**, when Sheet1 holds exactly one complete
week. Tue–Sun runs are skipped for archiving so partial weeks never accumulate.

## Producer

A new function `archiveWeekToHistorical(weekEnding)` in `apps-script/processAllR365Rreports.js`,
called from the **Monday branch** of `processWeeklySalesLabor`, *after* `processWeeklyData(data)`
returns. It:

1. Opens (or creates, with header row) the `Historical Data` tab.
2. Reads Sheet1's data rows — `getValues()` and `getNumberFormats()` — for the source columns.
3. Projects each location row to `[weekEnding, location, actualSales, forecastSales, salesVariance,
   pySales, laborPct, optHrs, actHrs, schHrs, schVsForVar]`.
4. Upserts by week (see Idempotency).
5. Copies the matching number formats so `FORMATTED_VALUE` strings match Sheet1 exactly.
6. The entire body runs inside a try/catch that logs and swallows errors — never propagates.

`processWeeklyData`'s signature is unchanged. Reading Sheet1 back (rather than threading its
in-memory `rows` array out) keeps the edit isolated and minimal, per the surgical-edits rule.

### Tab name constant

The literal `'Historical Data'` is added as `CONFIG.HISTORICAL_SHEET` for consistency with the
other sheet-name constants in `processAllR365Rreports.js`.

## Week-ending date (column A)

On Monday the week-ending Sunday is yesterday: `new Date()` minus 1 day, formatted `'M/d/yyyy'` in
`America/Chicago`. This matches the weekly debrief's "Week Ending" convention and parses cleanly
under the dropdown's `new Date(label)` sort.

## Idempotency (upsert by week)

Before appending, scan column A and delete any existing rows whose `Week Ending === weekEnding`
(delete bottom-up by row index), then append the fresh snapshot. Re-running the Monday job — or a
manual re-run — never duplicates a week.

## Backfill: forward-only

Start accumulating from the next Monday run onward. Rationale: fully faithful (all 11 columns
including Sch v For Labor Var, which the Flash sheets do not carry), zero risk, trivial. The dropdown
deepens one week at a time. A one-time Flash-based backfill could be added later if instant depth is
ever wanted, accepting a blank column K for old weeks — explicitly out of scope for v1 (YAGNI).

## Seed / test helper

A `testArchiveWeekToHistorical()` helper, runnable once from the Apps Script editor, snapshots the
*current* Sheet1 immediately with a chosen week-ending date. This seeds one week so the dropdown can
be verified end-to-end without waiting for Monday, and validates the format-fidelity path.

## Frontend

**No change required.** `loadAvailableWeeks` and `loadHistoricalWeek` already read and parse the
tab correctly. Once the producer creates and populates it, the dropdown lights up automatically.

## Edge cases

- `Historical Data` tab missing → created with header row.
- Empty Sheet1 (no data rows) → no-op, logged.
- Labor % stored as a fraction with `%` format → preserved via format copy, so the parser still
  yields `23.45`.
- Non-Monday processor runs → no archive write.
- Archive failure → caught, logged, swallowed; the rest of the processor is unaffected.

## Files touched

- `apps-script/processAllR365Rreports.js` — add `CONFIG.HISTORICAL_SHEET`, the
  `archiveWeekToHistorical()` function, the Monday-branch call, and the `testArchiveWeekToHistorical()`
  helper. No other file changes.

## Deploy & test (clasp loop)

1. `clasp pull` — reconcile local with whatever is live.
2. Edit `apps-script/processAllR365Rreports.js`.
3. `git commit` — version history.
4. `clasp push` — deploy to the live project.
5. Run `testArchiveWeekToHistorical()` once from the editor to seed a week and confirm the dashboard
   dropdown populates and renders correctly.
