import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function EnablePush() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (supported && vapid && Notification.permission === 'default' && localStorage.getItem('pushPromptDismissed') !== '1') {
      setShow(true);
    }
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setShow(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
      });
      await fetch('/api/chat/push/subscribe', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub }),
      });
      setShow(false);
    } catch (e) {
      console.error('enable push failed', e);
      setShow(false);
    }
    setBusy(false);
  };

  const dismiss = () => { localStorage.setItem('pushPromptDismissed', '1'); setShow(false); };

  if (!show) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-blue-600/15 border-b border-blue-600/30 text-sm">
      <Bell size={16} className="text-blue-400 flex-shrink-0" />
      <span className="text-slate-200 flex-1">Turn on notifications so you don't miss messages.</span>
      <button onClick={enable} disabled={busy} className="px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium">{busy ? '…' : 'Turn on'}</button>
      <button onClick={dismiss} className="p-1 text-slate-400 hover:text-white" aria-label="Dismiss"><X size={16} /></button>
    </div>
  );
}
