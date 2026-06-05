import { AlertCircle } from 'lucide-react';

export default function CallOffsTab({ filteredCallOffs, callOffsLoading, callOffsError, getDataDateRange }) {
  return (
    <>
      {/* Header with date range */}
      <div className="surface rounded-2xl p-3 mb-3 shadow-card">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white">Call-Offs</h2>
            {filteredCallOffs.length > 0 && (
              <p className="text-sm text-slate-400">
                Showing data for: {getDataDateRange(filteredCallOffs)}
              </p>
            )}
          </div>
          <div className="text-right">
            <span className="text-2xl font-bold text-orange-400">{filteredCallOffs.length}</span>
            <p className="text-xs text-slate-400">Total</p>
          </div>
        </div>
      </div>

      {callOffsError && (
        <div className="bg-rose-950/50 ring-1 ring-rose-500/30 rounded-lg p-3 mb-3 text-red-200">
          <strong>Error:</strong> {callOffsError}
        </div>
      )}

      {callOffsLoading ? (
        <div className="flex justify-center items-center py-20">
          <div className="flex flex-col items-center gap-3 text-slate-400"><div className="h-8 w-8 rounded-full border-2 border-white/15 border-t-andy-red animate-spin" /><span className="text-sm">Loading call-offs...</span></div>
        </div>
      ) : filteredCallOffs.length === 0 ? (
        <div className="surface rounded-2xl p-8 text-center">
          <AlertCircle className="mx-auto mb-3 text-green-400" size={48} />
          <h3 className="text-xl font-bold text-white mb-2">No Call-Offs Found</h3>
          <p className="text-slate-400">All scheduled employees showed up!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {(() => {
            // Group call-offs by date
            const groupedByDate = filteredCallOffs.reduce((acc, callOff) => {
              if (!acc[callOff.reportDate]) {
                acc[callOff.reportDate] = [];
              }
              acc[callOff.reportDate].push(callOff);
              return acc;
            }, {});

            // Sort dates in descending order (most recent first)
            const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a));

            return sortedDates.map((date) => {
              const callOffs = groupedByDate[date];
              return (
                <div key={date} className="surface rounded-2xl shadow-card overflow-hidden">
                  <div className="bg-white/5 p-3 border-b border-white/10">
                    <h3 className="text-lg font-bold text-white">{date}</h3>
                    <p className="text-xs text-slate-400">{callOffs.length} call-off{callOffs.length !== 1 ? 's' : ''}</p>
                  </div>

                  {/* Desktop Header */}
                  <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 border-b border-white/5 bg-slate-800" style={{gridTemplateColumns: '1fr 120px 150px'}}>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Name</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Location</div>
                    <div className="text-slate-400 text-xs md:text-sm font-semibold">Scheduled Time</div>
                  </div>

                  <div className="divide-y divide-white/10">
                    {callOffs.map((callOff, idx) => (
                      <div key={idx}>
                        {/* Desktop Layout */}
                        <div className="hidden md:grid gap-2 md:gap-4 p-2 md:p-3 hover:bg-white/5 transition-colors" style={{gridTemplateColumns: '1fr 120px 150px'}}>
                          <div className="text-white font-medium text-xs md:text-sm">{callOff.employee}</div>
                          <div className="text-slate-300 text-xs md:text-sm">{callOff.location}</div>
                          <div className="text-slate-300 text-xs md:text-sm">{callOff.scheduledTime}</div>
                        </div>

                        {/* Mobile Layout - All on one row */}
                        <div className="md:hidden p-2 flex items-center justify-between gap-2 text-xs">
                          <div className="text-white font-medium flex-1">{callOff.employee}</div>
                          <div className="text-slate-300">{callOff.location}</div>
                          <div className="text-slate-400">{callOff.scheduledTime}</div>
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
