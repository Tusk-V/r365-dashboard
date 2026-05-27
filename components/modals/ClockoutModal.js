export default function ClockoutModal({ data, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-sm w-full shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-white">{data.location} - Auto-Clockouts</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-1">
          {data.data.map((c, idx) => (
            <div key={idx} className="flex justify-between text-sm py-1 border-b border-slate-700 last:border-b-0">
              <span className="text-white">{c.employee}</span>
              <span className="text-red-400 font-medium">{c.extraHours === 'N/A' ? 'N/A' : c.extraHours ? `${c.extraHours}h` : ''}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
