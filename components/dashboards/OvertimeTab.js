import { AlertCircle } from 'lucide-react';

export default function OvertimeTab({ filteredOvertime, overtimeLoading, overtimeError, clockouts }) {
  return (
    <>
      {/* Header */}
      <div className="surface rounded-lg p-3 mb-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">OT Warnings</h2>
            <p className="text-sm text-slate-400">Employees approaching overtime this week</p>
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-yellow-400">{filteredOvertime.length}</span>
            <p className="text-xs text-slate-400">Total</p>
          </div>
        </div>
      </div>

      {overtimeError && (
        <div className="bg-rose-950/50 ring-1 ring-rose-500/30 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {overtimeError}
        </div>
      )}

      {overtimeLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400"><div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-andy-red animate-spin" /><span className="text-sm">Loading overtime warnings...</span></div>
        </div>
      ) : filteredOvertime.length === 0 ? (
        <div className="surface rounded-lg p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-green-400" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No OT Warnings</h3>
          <p className="text-slate-400">No employees approaching overtime this week!</p>
        </div>
      ) : (
        <div className="surface rounded-lg shadow-lg overflow-x-auto">
          {/* Header Row */}
          <div className="grid gap-2 p-2 border-b border-white/5 bg-slate-900 min-w-[360px]" style={{gridTemplateColumns: '1fr 90px 130px'}}>
            <div className="text-slate-400 text-xs font-semibold">Name</div>
            <div className="text-slate-400 text-xs font-semibold">Location</div>
            <div className="text-slate-400 text-xs font-semibold text-right">Est OT Start</div>
          </div>

          <div className="divide-y divide-slate-700 min-w-[360px]">
            {filteredOvertime.map((ot, idx) => {
              const hasAutoClockout = clockouts.some(c =>
                c.employee.toLowerCase() === ot.employee.toLowerCase() &&
                c.location === ot.location
              );
              return (
                <div key={idx} className="grid gap-2 p-2 hover:bg-slate-750 transition-colors" style={{gridTemplateColumns: '1fr 90px 130px'}}>
                  <div className="flex items-center gap-1 overflow-hidden">
                    <span className="text-white font-medium text-xs truncate">{ot.employee}</span>
                    {hasAutoClockout && (
                      <span className="bg-red-600 text-white text-[9px] px-1 py-0.5 rounded font-semibold flex-shrink-0">AC</span>
                    )}
                  </div>
                  <div className="text-slate-300 text-xs truncate">{ot.location}</div>
                  <div className="text-yellow-400 font-medium text-xs text-right whitespace-nowrap">{ot.estOTStart}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
