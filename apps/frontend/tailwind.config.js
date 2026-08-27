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
        // a component — pick the rung that matches the depth. Tuned for a
        // higher-contrast, premium "web app" feel.
        ink: '#08080b',       // app canvas (deepest)
        well: '#0e0e13',      // inputs, insets, code wells
        surface: '#101017',   // chrome: sidebar, topbar, modal header/footer
        panel: '#15151d',     // primary panels sitting on the canvas
        card: '#1b1b24',      // cards nested inside a panel
        raised: '#262633',    // hover / pressed / chip backgrounds

        // ------------------------------------------------------------ lines
        line: '#262633',
        'line-strong': '#393947',

        // ------------------------------------------------------------- text
        fg: '#ECECF2',
        'fg-muted': '#9b9bad',

        // ------------------------------------------------------------ brand
        // Amber remains the product accent (premium gold on the dark canvas).
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

        // Secondary accent — indigo/violet — used for AI + interactive moments
        // so the product reads as a modern SaaS CRM, not a single-hue demo.
        accent: {
          50: '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        // Soft, layered elevation used on panels and cards.
        card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)',
        'card-hover': '0 1px 0 0 rgba(255,255,255,0.05) inset, 0 16px 40px -16px rgba(0,0,0,0.7)',
        glow: '0 0 0 1px rgba(245,158,11,0.25), 0 12px 32px -12px rgba(245,158,11,0.35)',
        'glow-accent': '0 0 0 1px rgba(99,102,241,0.25), 0 12px 32px -12px rgba(99,102,241,0.4)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
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
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
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
