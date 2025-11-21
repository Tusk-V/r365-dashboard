text-center">
                  <p className="text-slate-400">No flash data available</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2 md:gap-3">
                  {filteredFlashData.map((loc, idx) => {
                    return (
                      <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-2 md:p-3 shadow-lg">
                        <div className="flex items-start justify-between mb-2 md:mb-3">
                          <h3 className="text-sm md:text-base font-bold text-white">{loc.location}</h3>
                        </div>

                        <div className="bg-slate-900 rounded-lg p-1.5 md:p-2">
                          <p className="text-slate-400 text-xs font-semibold mb-1 md:mb-2">DISCOUNTS</p>
                          <div className="space-y-0.5 md:space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 text-xs">Comps</span>
                              <span className="text-white font-bold text-xs">${loc.comps.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 text-xs">Discounts</span>
                              <span className="text-white font-semibold text-xs">${loc.discounts.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-slate-700">
                              <span className="text-slate-500 text-xs">Total</span>
                              <span className="text-white font-bold text-xs">${loc.totalDiscounts.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 text-xs">% of Sales</span>
                              <span className={`font-bold text-xs ${(loc.discountPercent * 100) > 3 ? 'text-orange-400' : 'text-white'}`}>
                                {(loc.discountPercent * 100).toFixed(2)}%
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500 text-xs">Voids</span>
                              <span className={`font-semibold text-xs ${loc.voids > 20 ? 'text-orange-400' : 'text-white'}`}>
                                ${loc.voids.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {showClockoutModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowClockoutModal(false)}
          >
            <div 
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-md w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Auto-Clockouts</h3>
                <button
                  onClick={() => setShowClockoutModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>
              
              <div className="mb-3">
                <p className="text-sm text-slate-400 mb-2">Location: <span className="text-white font-semibold">{clockoutModalData.location}</span></p>
                <p className="text-xs text-slate-500">The following employees have auto-clockouts this week:</p>
              </div>

              <div className="bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto">
                <ul className="space-y-2">
                  {clockoutModalData.employees.map((emp, idx) => (
                    <li key={idx} className="text-white text-sm py-1 border-b border-slate-700 last:border-b-0">
                      {emp}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setShowClockoutModal(false)}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}

        {showCallOffModal && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowCallOffModal(false)}
          >
            <div 
              className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-w-md w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">Call-Offs</h3>
                <button
                  onClick={() => setShowCallOffModal(false)}
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  <span className="text-2xl">×</span>
                </button>
              </div>
              
              <div className="mb-3">
                <p className="text-sm text-slate-400 mb-2">Location: <span className="text-white font-semibold">{callOffModalData.location}</span></p>
                <p className="text-xs text-slate-500">The following employees called off this week:</p>
              </div>

              <div className="bg-slate-900 rounded-lg p-3 max-h-64 overflow-y-auto">
                <ul className="space-y-2">
                  {callOffModalData.employees.map((emp, idx) => (
                    <li key={idx} className="text-white text-sm py-1 border-b border-slate-700 last:border-b-0">
                      {emp}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => setShowCallOffModal(false)}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
