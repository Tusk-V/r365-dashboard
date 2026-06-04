import { useEffect } from "react"
import { SessionProvider } from "next-auth/react"
import Head from "next/head"
import '../styles/globals.css'

export default function App({ Component, pageProps: { session, ...pageProps } }) {
  // Register the service worker once (browser-only, https-only, fail-silent)
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);

  // Keep the PWA app-icon badge in sync with total unread on every page (not just
  // /messages), so it clears once messages are read and the app is reopened/focused.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return;
    let cancelled = false;
    const sync = async () => {
      try {
        const res = await fetch('/api/chat/channels');
        if (!res.ok || cancelled) return; // 401/etc: leave the badge untouched
        const data = await res.json();
        if (cancelled) return;
        const n = data.totalUnread || 0;
        if (n > 0) navigator.setAppBadge(n).catch(() => {});
        else navigator.clearAppBadge().catch(() => {});
      } catch (_) {}
    };
    const onVisible = () => { if (!document.hidden) sync(); };
    sync();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
    };
  }, []);

  return (
    <SessionProvider session={session}>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </Head>
      <Component {...pageProps} />
    </SessionProvider>
  )
}
