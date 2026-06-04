# Chat Content & Language Filter — Design

**Date:** 2026-06-04
**Status:** Approved (Dalton)

## Goal

Keep the message board clean by auto-masking profanity and inappropriate
content. The message still posts; flagged words are replaced with `****`. No
blocking, no review queue (chosen behavior: auto-mask).

## Behavior

- Applied **server-side** on message **create (POST)** and **edit (PUT)**, for
  **all channels**, before the document is stored.
- Each flagged word/phrase is replaced with asterisks of matching length (or a
  fixed `****`), preserving surrounding text and punctuation.
- The stored + broadcast message is already masked, so every reader (and the
  push notification snippet) sees the masked version. There is no way to view
  the original (it is never stored).
- A boolean `filtered: true` is set on masked messages for light auditing.

## Detection

- A pure module `lib/contentFilter.js` exporting `maskText(str) -> { text, filtered }`.
- Two curated built-in lists:
  - **language** — profanity / swearing.
  - **content** — slurs, harassment, threats, sexual content.
- Matching is case-insensitive, whole-word (word boundaries), and handles common
  obfuscation lightly (e.g. internal punctuation/leetspeak for the worst terms).
  Must avoid the Scunthorpe problem (no masking inside innocent words).
- Lists live in code for v1. **Admin-editable lists are deferred** (out of scope
  for this spec); a follow-up can move them to the DB + a board admin editor.

## Integration

- `pages/api/chat/messages.js` POST/PUT: run `maskText` on `body.trim()` before
  building/updating the doc; store the masked text and `filtered` flag.
- No client changes required — the client renders whatever the server returns.

## Testing

- `lib/contentFilter.js` unit tests: masks listed profanity/slurs; preserves
  innocent words (Scunthorpe); case-insensitive; leaves clean text untouched;
  returns `filtered` correctly; idempotent on already-masked text.

## Out of scope (future)

- Admin-editable word lists + UI.
- Per-channel or per-tier filter strictness.
- AI/context-based moderation (the chosen mask-words behavior implies a wordlist;
  AI moderation returns categories, not spans to mask).
