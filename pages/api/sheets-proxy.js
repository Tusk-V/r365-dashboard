// pages/api/sheets-proxy.js
// Server-side proxy for Google Sheets reads. Keeps the API key off the client
// and gates access to authenticated @rancherscustard.com sessions.

import { getServerSession } from "next-auth/next";
import { authOptions } from "./auth/[...nextauth]";

// Hardcoded fallback matches the previous client-side value so behavior is
// identical if the env var is unset (e.g. local dev without env pull).
const FALLBACK_SPREADSHEET_ID = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';

// Range param must look like `<Sheet Name>!<A1Range>` — defense-in-depth
// against open-ended forwarding. Allows letters, digits, spaces, hyphens,
// punctuation common in sheet/range syntax. No semicolons or slashes.
const RANGE_PATTERN = /^[A-Za-z0-9 #_'\-.&!:$]+$/;

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!session.user?.email?.endsWith('@rancherscustard.com')) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_SHEETS_API_KEY not configured' });
  }

  const spreadsheetId = process.env.GOOGLE_SHEET_ID || FALLBACK_SPREADSHEET_ID;
  const range = (req.query.range || '').toString();
  if (!range) {
    return res.status(400).json({ error: 'Missing required "range" query param' });
  }
  if (!RANGE_PATTERN.test(range)) {
    return res.status(400).json({ error: 'Invalid range format' });
  }

  const upstream = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  try {
    const r = await fetch(upstream);
    const body = await r.text(); // pass through raw — keeps Google's error shape intact
    res.status(r.status);
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    // Light caching: 30s edge cache, allow stale-while-revalidate during refresh
    res.setHeader('Cache-Control', 'private, max-age=10, stale-while-revalidate=30');
    return res.send(body);
  } catch (err) {
    console.error('sheets-proxy upstream error:', err);
    return res.status(502).json({ error: 'Upstream fetch failed', message: err.message });
  }
}
