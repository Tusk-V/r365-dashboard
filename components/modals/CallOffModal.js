export default function CallOffModal({ data, onClose }) {
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
          <h3 className="text-base font-bold text-white">{data.location} - Call-Offs</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors text-xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="space-y-1">
          {data.employees.map((emp, idx) => (
            <div key={idx} className="text-white text-sm py-1 border-b border-slate-700 last:border-b-0">
              {emp}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
