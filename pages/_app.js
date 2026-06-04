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
