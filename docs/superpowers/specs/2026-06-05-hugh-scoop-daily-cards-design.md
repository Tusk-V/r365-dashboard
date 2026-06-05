# Hugh's Scoop — Daily Morning Cards — Design

**Date:** 2026-06-05
**Status:** Proposed (design decisions locked with Dalton; awaiting spec review)

## Goal

Auto-post a per-store "morning card" to each store's chat channel every day at
**7:00 AM Central**, summarizing yesterday's sales vs forecast and guests in an
associate-safe, motivating format. Posted by a bot named **Hugh's Scoop** (the
Andy's mascot). This replaces the one-off manual backfill we ran for 6/4 with a
recurring, self-contained job.

## Bot identity

- **authorName:** `Hugh's Scoop`
- **authorImage:** `/apple-touch-icon.png` (the existing Andy's/Hugh app icon — a
  static asset, renders via the normal `<img>` avatar, no Blob needed)
- **authorEmail:** `hughsscoop@rancherscustard.com` (synthetic; never logs in)
- **authorRole:** `null` (no tier badge)

## Card content (locked)

One card per store, posted to its `loc:<slug>` channel. Plain text + emoji
(renders natively in chat). **Associate-safe only** — no labor hours, labor cost,
P&L, or bonus.

```
📊 Thu, Jun 4 · 🍦 Sales $4,820 · 📈 +3% over forecast ✅ · 👥 312 guests (+6%)
🔥 Beat forecast 3 days running — keep it rolling!
```

- **Sales** = net sales for the date.
- **Delta** = `(actual − forecast) / forecast`, shown as `+N% over` / `−N% under`
  forecast (green over, amber under). Forecast = `sales − forecastVariance`.
- **Guests** = guest count, with `(±N%)` vs the store's trailing-4 same-weekday
  average (omit the comparison if no history).
- **Nudge line** = one short, varied, constructive sentence chosen by performance
  band. **Ramp-up stores (Claremore, Hunter's Creek) always get softened,
  encouraging copy** regardless of the number (per the debrief tone rules).
- Posted as a **pinned announcement** (left accent bar + 📣). Posting today's card
  **unpins the prior day's** Hugh's Scoop card in that channel, so each channel
  keeps exactly one pinned "today's numbers."
- **Silent:** inserted directly (no push fan-out) — appears in-channel and updates
  the unread badge, but fires no push notification.

## Data source

`Flash - Daily Sales` sheet (range `A2:I`) via the Google Sheets API key
(`GOOGLE_SHEETS_API_KEY`, already set), spreadsheet
`1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20`. Columns: `[0]` date (`M/D/YYYY`),
`[1]` location, `[2]` net sales, `[5]` forecastVariance, `[6]` guests. Store names
match `lib/channels` `LOCATIONS` exactly (verified during the 6/4 backfill).

**Timing dependency:** the sheet's daily rows are populated by the 6:30 AM Apps
Script processor; the 7:00 AM card run reads them after that completes (same
ordering the 7:00 AM debrief already relies on).

## Architecture

Three units, each with one responsibility:

1. **`lib/dailyCard.js`** (pure, CommonJS, unit-tested) — the card generator.
   - `buildDailyCards(rows, targetDate)` → `[{ store, channelKey, body, sales,
     forecast, deltaPct, guests }]` for every known store with data on
     `targetDate`. Pure over sheet rows; no I/O. Contains the delta math, guest
     trailing-average, nudge bands, and ramp-up softening. This is where the 6/4
     backfill logic lives, promoted to tested library code.
2. **`pages/api/cron/daily-cards.js`** — the scheduled endpoint.
   - **Auth:** `Authorization: Bearer ${CRON_SECRET}` (Vercel sends this header on
     cron invocations when `CRON_SECRET` is set). Reject otherwise (401). Also
     accept a manual super-admin session for testing.
   - **Central-time gate:** compute the current hour in `America/Chicago`; if it
     is not the 7 AM hour, return `{ skipped: 'not 7am central' }` and do nothing.
     (This is what makes the two UTC cron entries below DST-correct.)
   - Compute `targetDate` = **yesterday** in `America/Chicago`, formatted
     `M/D/YYYY`.
   - **Idempotency:** if any `chat_messages` with `source:'hugh-scoop'` and
     `metricsDate:targetDate` already exist, return `{ skipped: 'already posted' }`.
   - Fetch the sheet, `buildDailyCards`, then per channel: unpin prior
     `hugh-scoop` cards, insert today's pinned announcement (with the bot identity
     + `source:'hugh-scoop'`, `metricsDate`). No push.
   - Returns a summary `{ posted, metricsDate }`.
3. **`vercel.json`** — cron config. Two entries so 7 AM Central is hit year-round:
   `0 12 * * *` (12:00 UTC = 7 AM CDT) and `0 13 * * *` (13:00 UTC = 7 AM CST),
   both → `/api/cron/daily-cards`. The endpoint's Central-time gate ensures only
   the one that lands on 7 AM Central actually posts; idempotency double-guards.

## Environment

- `CRON_SECRET` — **must be added** to the Vercel project (any random string).
  Vercel then sends it as the cron Bearer token; the endpoint verifies it.
- `GOOGLE_SHEETS_API_KEY`, `MONGODB_URI` — already configured.

## Consistency cleanup

The 6/4 manual backfill posted as `Andy's Daily` (`source:'andys-daily'`, avatar
`null`). Update those existing docs to `authorName:'Hugh's Scoop'` +
`authorImage:'/apple-touch-icon.png'` so the history reads consistently. (One-off
`updateMany`, run once.)

## Testing

- `lib/dailyCard.js` unit tests (`node:test`): delta sign/format (over vs under),
  forecast derivation, guest trailing-average, nudge band selection, ramp-up
  softening always-encouraging, a store with no row for the date is skipped, store
  names map to correct `loc:` channel keys.
- Manual: trigger `/api/cron/daily-cards` on the Vercel preview with the Bearer
  secret (bypassing the time gate via a `?force=1` test param gated to super-admin)
  and confirm one pinned Hugh's Scoop card lands per store channel, silent.

## Out of scope

- In-chat photo/image attachments (separate, shares the Blob store).
- Manager-tier richer card (labor/scheduled) — future layered enhancement.
