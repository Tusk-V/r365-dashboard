/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Andy's Frozen Custard brand — used sparingly as accent only,
        // never as button fills. Active states, hairline accents, pinned items.
        andy: { red: '#e11d2a', gold: '#f7b500' },
      },
      boxShadow: {
        // Elevation for cards on the dark aurora background: a faint top inner
        // highlight + a soft, tight drop shadow reads as "floating" far better
        // than a large blurred shadow on dark UIs.
        card: '0 1px 0 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
      },
    },
  },
  plugins: [],
}
