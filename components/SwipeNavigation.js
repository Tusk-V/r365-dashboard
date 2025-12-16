import { useSwipeable } from 'react-swipeable';
import { useEffect, useState } from 'react';

const DASHBOARD_ORDER = [
  { id: 'sales', label: 'Weekly Sales' },
  { id: 'daily-sales', label: 'Daily Sales' },
  { id: 'daily-labor', label: 'Daily Labor' },
  { id: 'clockouts', label: 'Auto-Clockouts' },
  { id: 'call-offs', label: 'Call-Offs' },
  { id: 'overtime', label: 'OT Warnings' },
  { id: 'logbook', label: 'Logbook' },
  { id: 'paid-outs', label: 'Paid Outs' },
  { id: 'scheduled-today', label: 'Scheduled' },
];

export default function SwipeNavigation({ activeTab, setActiveTab, children }) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768 || 'ontouchstart' in window);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const currentIndex = DASHBOARD_ORDER.findIndex(d => d.id === activeTab);

  const handleSwipeLeft = () => {
    if (currentIndex === -1) return;
    const nextIndex = (currentIndex + 1) % DASHBOARD_ORDER.length;
    setActiveTab(DASHBOARD_ORDER[nextIndex].id);
  };

  const handleSwipeRight = () => {
    if (currentIndex === -1) return;
    const prevIndex = (currentIndex - 1 + DASHBOARD_ORDER.length) % DASHBOARD_ORDER.length;
    setActiveTab(DASHBOARD_ORDER[prevIndex].id);
  };

  const swipeHandlers = useSwipeable({
    onSwipedLeft: handleSwipeLeft,
    onSwipedRight: handleSwipeRight,
    preventScrollOnSwipe: true,
    trackMouse: false,
    delta: 50,
    swipeDuration: 500,
  });

  const showDots = currentIndex !== -1;

  return (
    <>
      {/* Position Dots - No background, no border */}
      {isMobile && showDots && (
        <div className="flex justify-center gap-2 py-2 mb-3">
          {DASHBOARD_ORDER.map((dashboard, index) => (
            <button
              key={dashboard.id}
              onClick={() => setActiveTab(dashboard.id)}
              className={`w-2 h-2 rounded-full transition-all duration-200 ${
                index === currentIndex
                  ? 'bg-blue-500 w-3'
                  : 'bg-slate-600 hover:bg-slate-500'
              }`}
              aria-label={`Go to ${dashboard.label}`}
            />
          ))}
        </div>
      )}

      {/* Swipeable Content Area */}
      <div {...swipeHandlers} className="touch-pan-y">
        {children}
      </div>
    </>
  );
}
