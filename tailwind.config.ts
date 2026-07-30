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
          50: 'rgb(var(--tenant-accent-50-rgb) / <alpha-value>)',
          100: 'rgb(var(--tenant-accent-100-rgb) / <alpha-value>)',
          200: 'rgb(var(--tenant-accent-200-rgb) / <alpha-value>)',
          300: 'rgb(var(--tenant-accent-300-rgb) / <alpha-value>)',
          400: 'rgb(var(--tenant-accent-400-rgb) / <alpha-value>)',
          500: 'rgb(var(--tenant-accent-500-rgb) / <alpha-value>)',
          600: 'rgb(var(--tenant-accent-600-rgb) / <alpha-value>)',
          700: 'rgb(var(--tenant-accent-700-rgb) / <alpha-value>)',
          800: 'rgb(var(--tenant-accent-800-rgb) / <alpha-value>)',
          900: 'rgb(var(--tenant-accent-900-rgb) / <alpha-value>)',
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
          hover: 'var(--tenant-accent-hover)',
          active: 'var(--tenant-accent-active)',
          soft: 'var(--tenant-accent-soft)',
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
        'glow-gold': '0 0 20px rgb(var(--tenant-accent-rgb) / 0.12)',
        'glow-gold-lg': '0 0 36px rgb(var(--tenant-accent-rgb) / 0.16)',
        panel:
          'inset 0 1px 0 rgba(255,255,255,0.025), 0 1px 2px rgba(0,0,0,0.28), 0 18px 44px rgba(0,0,0,0.14)',
        'panel-lg':
          'inset 0 1px 0 rgba(255,255,255,0.04), 0 28px 80px rgba(0,0,0,0.5), 0 2px 10px rgba(0,0,0,0.28)',
      },
      backgroundImage: {
        'gold-gradient':
          'linear-gradient(135deg, rgb(var(--tenant-accent-500-rgb)) 0%, rgb(var(--tenant-accent-300-rgb)) 50%, rgb(var(--tenant-accent-600-rgb)) 100%)',
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
