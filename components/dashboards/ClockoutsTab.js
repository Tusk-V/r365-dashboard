import { AlertCircle } from 'lucide-react';

export default function ClockoutsTab({ filteredClockouts, clockoutsLoading, clockoutsError, getDataDateRange }) {
  return (
    <>
      {/* Header with date range */}
      <div className="surface rounded-2xl p-3 mb-3 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Auto-Clockouts</h2>
            {filteredClockouts.length > 0 && (
              <p className="text-sm text-slate-400">
                Showing data for: {getDataDateRange(filteredClockouts)}
              </p>
            )}
          </div>
          <div className="flex gap-4 text-right">
            <div>
              <span className="text-2xl font-bold text-red-400">{filteredClockouts.length}</span>
              <p className="text-xs text-slate-400">Total</p>
            </div>
            <div>
              <span className="text-2xl font-bold text-orange-400">
                {filteredClockouts.reduce((sum, c) => {
                  const hrs = parseFloat(c.extraHours);
                  return sum + (isNaN(hrs) ? 0 : hrs);
                }, 0).toFixed(1)}h
              </span>
              <p className="text-xs text-slate-400">Extra Hours</p>
            </div>
          </div>
        </div>
      </div>

      {clockoutsError && (
        <div className="bg-rose-950/50 ring-1 ring-rose-500/30 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {clockoutsError}
        </div>
      )}

      {clockoutsLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400"><div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-andy-red animate-spin" /><span className="text-sm">Loading auto-clockouts...</span></div>
        </div>
      ) : filteredClockouts.length === 0 ? (
        <div className="surface rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-green-400" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No Auto-Clockouts Found</h3>
          <p className="text-slate-400">All employees clocked out properly!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            // Group auto-clockouts by date
            const groupedByDate = filteredClockouts.reduce((acc, clockout) => {
              if (!acc[clockout.reportDate]) {
                acc[clockout.reportDate] = [];
              }
              acc[clockout.reportDate].push(clockout);
              return acc;
            }, {});

            // Sort dates in descending order (most recent first)
            const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

            return sortedDates.map((date) => {
              const clockouts = groupedByDate[date];
              const totalExtraHours = clockouts.reduce((sum, c) => {
                const hrs = parseFloat(c.extraHours);
                return sum + (isNaN(hrs) ? 0 : hrs);
              }, 0);

              return (
                <div key={date} className="surface rounded-2xl shadow-card overflow-hidden">
                  <div className="bg-white/5 p-3 border-b border-white/10 flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-bold text-white">{date}</h3>
                      <p className="text-xs text-slate-400">{clockouts.length} auto-clockout{clockouts.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-red-400">{totalExtraHours.toFixed(1)}h</span>
                      <p className="text-xs text-slate-400">Extra</p>
                    </div>
                  </div>

                  {/* Desktop Header */}
                  <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 border-b border-white/5 bg-slate-800" style={{gridTemplateColumns: '1fr 120px 70px'}}>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Name</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Location</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold text-right">Extra Hrs</div>
                  </div>

                  <div className="divide-y divide-white/10">
                    {clockouts.map((clockout, idx) => (
                      <div key={idx}>
                        {/* Desktop Layout */}
                        <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 hover:bg-white/5 transition-colors" style={{gridTemplateColumns: '1fr 120px 70px'}}>
                          <div className="text-white font-medium text-xs md:text-sm">{clockout.employee}</div>
                          <div className="text-slate-300 text-xs md:text-sm">{clockout.location}</div>
                          <div className="text-red-400 font-semibold text-xs md:text-sm text-right">{clockout.extraHours === 'N/A' ? 'N/A' : clockout.extraHours ? `${clockout.extraHours}h` : ''}</div>
                        </div>

                        {/* Mobile Layout - All on one row */}
                        <div className="md:hidden p-2 flex items-center justify-between gap-2 text-xs">
                          <div className="text-white font-medium flex-1">{clockout.employee}</div>
                          <div className="text-slate-300">{clockout.location}</div>
                          <div className="text-red-400 font-semibold">{clockout.extraHours === 'N/A' ? 'N/A' : clockout.extraHours ? `${clockout.extraHours}h` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </>
  );
}
