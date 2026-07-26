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
        graphite: {
          950: '#06090e',
          900: '#0b0f17',
          800: '#101620',
          700: '#171e2a',
          600: '#222b39',
          500: '#364152',
          400: '#526078',
        },
        gold: {
          50: '#fdf8ec',
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
          base: 'rgb(var(--surface-base) / <alpha-value>)',
          raised: 'rgb(var(--surface-raised) / <alpha-value>)',
          overlay: 'rgb(var(--surface-overlay) / <alpha-value>)',
          border: 'rgb(var(--surface-border) / <alpha-value>)',
        },
        brand: {
          DEFAULT: 'rgb(var(--tenant-accent-rgb) / <alpha-value>)',
          foreground: 'var(--tenant-accent-foreground)',
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
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'glow-gold': '0 0 20px rgba(201,168,76,0.12)',
        'glow-gold-lg': '0 0 36px rgba(201,168,76,0.16)',
        panel:
          'inset 0 1px 0 rgba(255,255,255,0.025), 0 1px 2px rgba(0,0,0,0.28), 0 18px 44px rgba(0,0,0,0.14)',
        'panel-lg':
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 28px 80px rgba(0,0,0,0.5), 0 2px 10px rgba(0,0,0,0.28)',
      },
      backgroundImage: {
        'gold-gradient': 'linear-gradient(135deg, #c9a84c 0%, #e8c34a 50%, #b8911e 100%)',
        'surface-gradient': 'linear-gradient(180deg, #101620 0%, #0b0f17 100%)',
        'glass-gradient':
          'linear-gradient(135deg, rgba(255,255,255,0.045) 0%, rgba(255,255,255,0.018) 100%)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-gold': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.24s ease-out',
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

export default config
