// components/SwipeNavigation.js
// Swipe navigation for mobile dashboard switching

import { useSwipeable } from 'react-swipeable';
import { useEffect, useState } from 'react';

// Dashboard order for swipe navigation (excludes P&L)
const DASHBOARD_ORDER = [
  { id: 'sales', label: 'Weekly Sales' },
  { id: 'daily-sales', label: 'Daily Sales' },
  { id: 'daily-labor', label: 'Daily Labor' },
  { id: 'clockouts', label: 'Auto-Clockouts' },
  { id: 'call-offs', label: 'Call-Offs' },
  { id: 'overtime', label: 'OT Warnings' },
  { id: 'scheduled-today', label: 'Scheduled' },
];

export default function SwipeNavigation({ activeTab, setActiveTab, children }) {
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile/touch device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Get current index in the dashboard order
  const currentIndex = DASHBOARD_ORDER.findIndex(d => d.id === activeTab);
  
  // Handle swipe navigation
  const handleSwipeLeft = () => {
    if (currentIndex === -1) return; // Current tab not in swipe cycle (e.g., P&L)
    const nextIndex = (currentIndex + 1) % DASHBOARD_ORDER.length;
    setActiveTab(DASHBOARD_ORDER[nextIndex].id);
  };

  const handleSwipeRight = () => {
    if (currentIndex === -1) return; // Current tab not in swipe cycle
    const prevIndex = (currentIndex - 1 + DASHBOARD_ORDER.length) % DASHBOARD_ORDER.length;
    setActiveTab(DASHBOARD_ORDER[prevIndex].id);
  };

  // Swipe handlers (mobile only)
  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleSwipeLeft,
    onSwipedRight: handleSwipeRight,
    preventScrollOnSwipe: true,
    trackMouse: false, // Desktop users use dropdown
    delta: 50, // Minimum swipe distance
    swipeDuration: 500, // Max time for swipe gesture
  });

  // Only show dots if current tab is in the swipe cycle
  const showDots = currentIndex !== -1;

  return (
    <>
      {/* Position Dots - Only show on mobile and for swipeable dashboards */}
      {isMobile && showDots && (
        <div className="flex justify-center gap-2 py-2 bg-slate-800/50 border-b border-slate-700">
          {DASHBOARD_ORDER.map((dashboard, index) => (
            <button
              key={dashboard.id}
              onClick={() => setActiveTab(dashboard.id)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? 'bg-blue-500 w-4'
                  : 'bg-slate-600 hover:bg-slate-500'
              }`}
              aria-label={`Go to ${dashboard.label}`}
              title={dashboard.label}
            />
          ))}
        </div>
      )}

      {/* Swipeable Content Area - Only enable swipe on mobile */}
      {isMobile ? (
        <div {...swipeHandlers} className="flex-1 min-h-0">
          {children}
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          {children}
        </div>
      )}
    </>
  );
}
