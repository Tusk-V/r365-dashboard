// lib/audit.js
// Append-only audit trail for role and chat-membership changes.
// Never throws: a logging failure is swallowed so it can never block the user's action.
export async function logAudit(db, { actorEmail, action, targetEmail = null, detail = null }) {
  try {
    await db.collection('chat_audit').insertOne({
      actorEmail, action, targetEmail, detail, at: new Date(),
    });
  } catch (err) {
    console.error('audit log failed:', { action, actorEmail, targetEmail }, err);
  }
}
