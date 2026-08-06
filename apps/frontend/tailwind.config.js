/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // ---------------------------------------------------------- surfaces
        // One elevation ladder for the whole product. Never hardcode a hex in
        // a component — pick the rung that matches the depth.
        ink: '#0b0b0f',       // app canvas (deepest)
        well: '#101015',      // inputs, insets, code wells
        surface: '#141419',   // chrome: sidebar, topbar, modal header/footer
        panel: '#17171d',     // primary panels sitting on the canvas
        card: '#1d1d25',      // cards nested inside a panel
        raised: '#26262f',    // hover / pressed / chip backgrounds

        // ------------------------------------------------------------ lines
        line: '#26262f',
        'line-strong': '#34343f',

        // ------------------------------------------------------------- text
        fg: '#e8e8ef',

        // ------------------------------------------------------------ brand
        // Single accent for the product. Amber reads as "premium gold" on the
        // dark canvas and clears 10:1 against ink for button labels.
        brand: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
          950: '#451a03',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        'slide-in': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to: { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'scale-in': {
          from: { transform: 'scale(0.97)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
      },
      animation: {
        // `animate-slide-in` was referenced by the analyzer drawer but never
        // existed, so the drawer just popped. These back it properly.
        'slide-in': 'slide-in 220ms cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 160ms ease-out',
        'scale-in': 'scale-in 180ms cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [
    // `scrollbar-none` was used across the app but never existed. Define it.
    function ({ addUtilities }) {
      addUtilities({
        '.scrollbar-none': {
          'scrollbar-width': 'none',
          '-ms-overflow-style': 'none',
          '&::-webkit-scrollbar': { display: 'none' },
        },
      });
    },
  ],
};
