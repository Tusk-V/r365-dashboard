// Deterministic avatar background color from a name/email, so each person keeps
// a stable, distinct color across the chat (far easier to scan a stream and the
// member stacks than a wall of identical slate circles). Returns a Tailwind
// bg-* class. All chosen for legible white text on top.
const AVATAR_COLORS = [
  'bg-rose-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-500',
  'bg-teal-500', 'bg-sky-500', 'bg-blue-500', 'bg-indigo-500',
  'bg-violet-500', 'bg-fuchsia-500', 'bg-pink-500', 'bg-cyan-600',
];

export function avatarColor(key) {
  const s = (key || '').trim().toLowerCase();
  if (!s) return 'bg-slate-600';
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
