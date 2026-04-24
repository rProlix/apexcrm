import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './modules/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Graphite base palette
        graphite: {
          950: '#08080a',
          900: '#0d0d0f',
          800: '#141416',
          700: '#1a1a1e',
          600: '#222228',
          500: '#2e2e36',
          400: '#3d3d48',
        },
        // Gold accent palette
        gold: {
          50:  '#fdf8ec',
          100: '#f9edcc',
          200: '#f2d98a',
          300: '#e8c34a',
          400: '#d4a82a',
          500: '#c9a84c',
          600: '#b8911e',
          700: '#9a7518',
          800: '#7d5e14',
          900: '#664d10',
        },
        // Semantic surface tokens
        surface: {
          base:   '#0d0d0f',
          raised: '#141416',
          overlay:'#1a1a1e',
          border: '#2e2e36',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'JetBrains Mono', 'ui-monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        'xl':  '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glow-gold':   '0 0 20px rgba(201,168,76,0.15)',
        'glow-gold-lg':'0 0 40px rgba(201,168,76,0.2)',
        'panel':       '0 1px 3px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
        'panel-lg':    '0 2px 8px rgba(0,0,0,0.6), 0 8px 32px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'gold-gradient':    'linear-gradient(135deg, #c9a84c 0%, #e8c34a 50%, #b8911e 100%)',
        'surface-gradient': 'linear-gradient(180deg, #141416 0%, #0d0d0f 100%)',
        'glass-gradient':   'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-gold': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in':    'fade-in 0.3s ease-out',
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
