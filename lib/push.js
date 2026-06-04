// Web Push (VAPID) helpers. CommonJS so the test runner and Next.js can both use
// it. web-push is configured lazily so requiring this in tests (no env) is safe.
const webpush = require('web-push');
const { deriveChannelsForUser } = require('./channels');

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

let configured = false;
function ensureConfigured() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@rancherscustard.com', pub, priv);
  configured = true;
  return true;
}

// Pure: emails to notify for a channel, given user docs. Excludes the author and
// (for non-announcements) anyone who muted the channel; only users who can access
// the channel are included.
function recipientsForChannel(users, channelKey, { excludeEmail, isAnnouncement } = {}) {
  const out = [];
  for (const u of users || []) {
    if (!u || !u.email || u.email === excludeEmail) continue;
    const isAdmin = u.email === ADMIN_EMAIL;
    const channels = deriveChannelsForUser({ isAdmin, dashboardAccess: u.dashboardAccess, chatAccess: u.chatAccess });
    if (!channels.some(c => c.key === channelKey)) continue;
    if (!isAnnouncement && (u.mutedChannels || []).includes(channelKey)) continue;
    out.push(u.email);
  }
  return out;
}

// I/O: send a payload to all push subscriptions for the given emails; prune dead subs.
async function sendToEmails(db, emails, payload) {
  if (!ensureConfigured() || !emails || emails.length === 0) return;
  const subs = await db.collection('push_subscriptions').find({ userEmail: { $in: emails } }).toArray();
  const body = JSON.stringify(payload);
  await Promise.allSettled(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
    } catch (err) {
      if (err && (err.statusCode === 404 || err.statusCode === 410)) {
        await db.collection('push_subscriptions').deleteOne({ endpoint: s.endpoint });
      }
    }
  }));
}

module.exports = { recipientsForChannel, sendToEmails, ensureConfigured };
