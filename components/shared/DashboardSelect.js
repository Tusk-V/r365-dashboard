import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

// Canonical dashboard list. To add a new dashboard, add it here and the
// dropdown updates everywhere it's used. `requires` maps to the access key
// returned by /api/check-access.
const ALL_OPTIONS = [
  { value: 'sales',            label: 'Weekly Sales & Labor', requires: 'dashboard' },
  { value: 'daily-sales',      label: 'Daily Sales',          requires: 'dashboard' },
  { value: 'daily-labor',      label: 'Daily Labor',          requires: 'dashboard' },
  { value: 'clockouts',        label: 'Auto-Clockouts',       requires: 'dashboard' },
  { value: 'call-offs',        label: 'Call-Offs',            requires: 'dashboard' },
  { value: 'overtime',         label: 'OT Warnings',          requires: 'dashboard' },
  { value: 'logbook',          label: 'Logbook',              requires: 'dashboard' },
  { value: 'paid-outs',        label: 'Paid Outs',            requires: 'dashboard' },
  { value: 'scheduled-today',  label: 'Scheduled Today',      requires: 'dashboard' },
  { value: 'forecast',         label: 'Forecasting',          requires: 'dashboard' },
  { value: 'pl',               label: 'Profit & Loss',        requires: 'pl' },
  { value: 'bonus',            label: 'Quarterly Bonus',      requires: 'bonus' },
];

export default function DashboardSelect({ value, onChange, className }) {
  const router = useRouter();
  const [access, setAccess] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/check-access')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setAccess({
          dashboard: data.isAdmin || data.dashboardAccess?.type !== 'none',
          pl: data.isAdmin || data.plAccess?.type !== 'none',
          bonus: data.isAdmin || data.bonusAccess?.type !== 'none',
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // While loading permissions, hide gated items (pl/bonus) by default so the
  // dropdown never briefly exposes options the user can't access. Tabs stay
  // visible since the user is already on a dashboard page.
  const visibleOptions = ALL_OPTIONS.filter((opt) => {
    if (!access) return opt.requires === 'dashboard' || opt.value === value;
    return access[opt.requires];
  });

  // Make sure the currently-selected value is always present even if filtering
  // would otherwise hide it (defensive — shouldn't normally happen).
  if (value && !visibleOptions.some((o) => o.value === value)) {
    const current = ALL_OPTIONS.find((o) => o.value === value);
    if (current) visibleOptions.push(current);
  }

  const defaultHandleChange = (e) => {
    const next = e.target.value;
    if (next === value) return;
    if (next === 'pl') {
      router.push('/pl');
    } else if (next === 'bonus') {
      router.push('/bonus');
    } else {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('pendingTab', next);
      }
      router.push('/');
    }
  };

  return (
    <select
      value={value}
      onChange={onChange || defaultHandleChange}
      className={className}
    >
      {visibleOptions.map((opt) => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  );
}
