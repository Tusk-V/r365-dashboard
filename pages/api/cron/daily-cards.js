// pages/api/cron/daily-cards.js
// "Hugh's Scoop" — posts one pinned, silent daily card per store channel at 7 AM
// Central. Invoked by Vercel Cron (two UTC entries) with a CRON_SECRET bearer; an
// in-code America/Chicago hour gate makes exactly one of them fire on 7 AM Central
// year-round (DST-safe). Idempotent per metricsDate. Super-admin may trigger
// manually with ?force=1 to bypass the time gate (for testing).
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";
import { buildDailyCards } from "../../../lib/dailyCard";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';
const SPREADSHEET = '1WsHBn5qLczH8QZ1c-CyVGfCWzMuLg2vmx5R5MZdHY20';

function chicagoParts(d) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hour12: false,
  }).formatToParts(d);
  const get = (t) => p.find((x) => x.type === t)?.value;
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0;
  return { y: Number(get('year')), m: Number(get('month')), day: Number(get('day')), hour };
}

export default async function handler(req, res) {
  // Auth: Vercel cron bearer OR a super-admin session (manual/testing).
  const secret = process.env.CRON_SECRET;
  const isCron = !!secret && (req.headers.authorization === `Bearer ${secret}`);
  const session = await getServerSession(req, res, authOptions);
  const isSuperAdmin = session?.user?.email === ADMIN_EMAIL;
  if (!isCron && !isSuperAdmin) return res.status(401).json({ error: 'Unauthorized' });

  const now = new Date();
  const { y, m, day, hour } = chicagoParts(now);
  const force = req.query.force === '1' && isSuperAdmin;
  if (!force && hour !== 7) return res.status(200).json({ skipped: 'not 7am central', chicagoHour: hour });

  // Yesterday in Central, as M/D/YYYY (noon-UTC anchor avoids DST edges).
  const yest = new Date(Date.UTC(y, m - 1, day, 12) - 24 * 3600 * 1000);
  const targetDate = `${yest.getUTCMonth() + 1}/${yest.getUTCDate()}/${yest.getUTCFullYear()}`;

  try {
    const db = (await clientPromise).db("andysdashboard");
    const existing = await db.collection('chat_messages').countDocuments({ source: 'hugh-scoop', metricsDate: targetDate });
    if (existing > 0) return res.status(200).json({ skipped: 'already posted', metricsDate: targetDate });

    const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GOOGLE_SHEETS_API_KEY not configured' });
    const spreadsheetId = process.env.GOOGLE_SHEET_ID || SPREADSHEET;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent('Flash - Daily Sales!A2:I')}?key=${apiKey}`;
    const sheet = await (await fetch(url)).json();
    const cards = buildDailyCards(sheet.values || [], targetDate);
    if (cards.length === 0) return res.status(200).json({ posted: 0, metricsDate: targetDate, note: 'no rows for date' });

    const ts = new Date();
    const keys = cards.map((c) => c.channelKey);
    // Keep exactly one pinned Hugh's Scoop card per channel: unpin prior ones.
    await db.collection('chat_messages').updateMany(
      { source: 'hugh-scoop', pinned: true, channelKey: { $in: keys } },
      { $set: { pinned: false } }
    );
    const docs = cards.map((c) => ({
      channelKey: c.channelKey,
      body: c.body,
      filtered: false,
      authorEmail: 'hughsscoop@rancherscustard.com',
      authorName: "Hugh's Scoop",
      authorImage: '/apple-touch-icon.png',
      authorRole: null,
      createdAt: ts, updatedAt: ts, editedAt: null,
      isAnnouncement: true, priority: 'normal', pinned: true,
      reactions: {}, deleted: false,
      source: 'hugh-scoop', metricsDate: targetDate,
    }));
    await db.collection('chat_messages').insertMany(docs);
    return res.status(200).json({ posted: docs.length, metricsDate: targetDate });
  } catch (e) {
    console.error('daily-cards error', e);
    return res.status(500).json({ error: 'Failed to post daily cards' });
  }
}
