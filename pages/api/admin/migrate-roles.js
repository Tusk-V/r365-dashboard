// pages/api/admin/migrate-roles.js
// One-off, idempotent role migrations. Super-admin only. DELETE THIS FILE after
// running once against the live database (see plan Task 8).
//   POST -> { legacyRoleToFom, ownerFomCleared }
import { getServerSession } from "next-auth/next";
import { authOptions } from "../auth/[...nextauth]";
import clientPromise from "../../../lib/mongodb";

const ADMIN_EMAIL = 'dalton@rancherscustard.com';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  if (session.user.email !== ADMIN_EMAIL) return res.status(403).json({ error: 'Super admin only' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const db = (await clientPromise).db("andysdashboard");

  // 1) Legacy `role: 'FOM'` -> fom:true, then drop the field for everyone.
  const legacy = await db.collection('users').updateMany(
    { role: 'FOM' }, { $set: { fom: true } }
  );
  await db.collection('users').updateMany({ role: { $exists: true } }, { $unset: { role: '' } });

  // 2) Undo the old owner⇒fom coupling: owners stand alone.
  const owners = await db.collection('users').updateMany(
    { owner: true }, { $set: { fom: false } }
  );

  return res.status(200).json({
    legacyRoleToFom: legacy.modifiedCount,
    ownerFomCleared: owners.modifiedCount,
  });
}
