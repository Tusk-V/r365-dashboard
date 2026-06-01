# Editable Recap Roster + Draft-Based Sending — Design

**Date:** 2026-06-01
**Status:** Approved for planning
**Builds on:** `2026-06-01-manager-recap-emails-design.md`

## Goal

Two changes to the manager recap feature:
1. **Editable roster** — a hand-curated location→recipients list (1–2 people per
   store), managed on `/admin/recap-roster`, replacing the dashboard-access
   derivation that pulled in too many people.
2. **Draft-based sending** — instead of auto-sending, create a Gmail **draft**
   per recipient in the sending account each morning. Dalton reviews and sends,
   so each email genuinely comes from him, with his image signature and simpler
   wording.

## Decisions (locked)

| Decision | Choice |
|----------|--------|
| Roster storage | New `recapRoster` collection, one doc per store |
| Recipient entry | Pick from existing app users |
| Names | Auto from the user record, editable override |
| Seeding | Seed from current derived list on first load; trim; Save persists |
| Send model | **Gmail drafts** in the sending account (not auto-send) |
| Email style | Simpler, less wordy; plain personal layout (no branded chrome) |
| Signature | Image embedded via `<img>` at the bottom |
| Leadership copy | `MANAGER_RECAP_CC` still applied to each draft |

## Part 1 — Editable roster

### Data model
Collection `recapRoster` in `andysdashboard`, one document per store:
```
{ location: "Bixby", recipients: [{ email, name }], updatedAt, updatedBy }
```
Recipients are app users. `name` is captured from the user record when added
and is editable (the optional override). Unique index on `location`.

### Endpoints
- **`GET /api/admin/recap-roster`** (session + `ADMIN_EMAIL`): returns
  `{ locations: [{location, recipients:[{email,name}]}], availableUsers:
  [{email,name}], seeded }`. If `recapRoster` is empty, it returns the
  derived list (from `extractManagers`) as an unsaved seed (`seeded:false`).
  `availableUsers` populates the picker.
- **`POST /api/admin/recap-roster`** (session + `ADMIN_EMAIL`): accepts the
  edited roster and upserts one doc per location. Rejects any recipient email
  that is not a known app user. Stamps `updatedAt`/`updatedBy`.
- **`GET /api/store-managers`** (token, used by Apps Script): now reads
  `recapRoster` and returns the existing `[{name, email, locations}]` shape,
  grouped by email across stores. If `recapRoster` is empty, falls back to the
  current dashboard-access derivation so nothing breaks pre-migration. **The
  Apps Script roster fetch is unchanged.**

### Admin page (`/admin/recap-roster`)
The read-only page becomes editable: one row per store; recipients as removable
chips; an "add recipient" dropdown of app users; an editable name field per
recipient; a Save action. First visit shows the seeded (derived) list to trim.
Validation surfaces clearly. Reuses the existing dark-slate styling.

### Tested logic (pure helpers in `lib/storeManagers.js`)
- `rosterToManagers(rosterDocs)` → `[{name,email,locations}]` grouped by email.
- `validateRecipients(recipients, knownEmails)` → emails not in the known set.

## Part 2 — Draft-based sending

### Behavior
The ~7:15 AM trigger creates one **Gmail draft per recipient** in the sending
account via `GmailApp.createDraft(recipient, subject, '', options)` with
`htmlBody`, and `cc` set to `MANAGER_RECAP_CC` when present. Dalton reviews the
Drafts folder and sends. Drafts originate from the account that runs the script
(dalton@rancherscustard.com), so sent mail comes from him.

`replyTo` is dropped (replies come back to the sender naturally). The
`MANAGER_RECAP_REPLY_TO` property is no longer used by the draft path.

### Email content & layout (simpler)
- **Shorter prompt:** one or two brief, casual sentences per store — drop the
  longer constructive paragraphs. Still grounded in the store's numbers, still
  invites a quick recap, still escalates gently on missed-forecast-AND-over-
  scheduled. No grades, no internal flags.
- **Plain layout:** remove the branded header bar and footer. The body is a
  simple personal note (greeting, the short note per store), then the signature.
- **Signature:** append at the bottom — the signature image followed by the
  name/title block (the text is also a graceful fallback if the image is
  blocked):
  ```
  <img src="https://ci3.googleusercontent.com/mail-sig/AIorK4zYQoLW7nhXQU1EvNY5LJL02mU8weD5RJN3G9VpcHFfHabY6AFsa5h87yz5x7OVU4q4DJu2LFw">

  Dalton Owens
  Owner/Operator
  Ranchers Custard Company, LLC
  Andy's Frozen Custard Franchisee
  ```
  The image URL lives in `RECAP_CONFIG.SIGNATURE_IMG_URL` and the text block in
  `RECAP_CONFIG.SIGNATURE_TEXT`, so both are one-line edits if they change.

### Apps Script changes (`RanchersManagerRecap.js`)
- `sendManagerRecaps` → `createManagerRecapDrafts`: `GmailApp.createDraft` per
  recipient instead of `MailApp.sendEmail`; same grouping, CC, and logging.
- `buildManagerRecapHtml`: simpler plain body + signature `<img>`; drop chrome.
- `buildManagerPrompt`: shorter, simpler output.
- `setupManagerRecapTrigger`: points at `createManagerRecapDrafts`.
- `testManagerRecaps`: creates a single labeled preview draft (subject prefixed
  `[TEST]`) for review rather than emailing.
- Log tab status becomes `Drafted` / `Preview` / `Failed`.

## Error handling
- Roster fetch failure → abort, create nothing.
- Store with no recipients or no data → skipped.
- Per-recipient try/catch so one failure doesn't stop the batch; failures logged.
- Admin POST validates against known users before writing.

## Testing
- Unit-test `rosterToManagers` and `validateRecipients`.
- Admin API/page and the Gmail-draft path are verified manually (no HTTP/Gmail
  harness in the repo), consistent with existing convention.

## Out of scope
- Changing the from-address beyond what the sending account already is.
- A formatted text signature block (the image is the signature).
- Auto-sending (explicitly replaced by drafts).
