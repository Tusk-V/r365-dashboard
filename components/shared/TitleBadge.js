export default function TitleBadge({ title }) {
  if (!title) return null;

  const colors = {
    'GM': 'bg-purple-600 text-white',
    'AGM': 'bg-blue-600 text-white',
    'SL': 'bg-green-600 text-white'
  };

  return (
    <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] font-semibold rounded ${colors[title] || 'bg-slate-600 text-white'}`}>
      {title}
    </span>
  );
}
