import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontSize: {
        'xs':   ['12px', { lineHeight: '1.4' }],
        'sm':   ['14px', { lineHeight: '1.5' }],
        'base': ['16px', { lineHeight: '1.6' }],
        'lg':   ['18px', { lineHeight: '1.5' }],
        'xl':   ['20px', { lineHeight: '1.4' }],
        '2xl':  ['24px', { lineHeight: '1.3' }],
        '3xl':  ['28px', { lineHeight: '1.25' }],
        '4xl':  ['38px', { lineHeight: '1.2' }],
      },
      colors: {
        // Legacy brand palette — kept for backward compat during migration
        brand: {
          orange: '#fb923c',
          purple: '#c084fc',
          gold:   '#f0c060',
          green:  '#22c55e',
          cyan:   '#22d3ee',
          red:    '#ef4444',
        },
        // New authoritative GH palette — all new code uses this namespace
        gh: {
          orange:        'var(--gh-orange)',
          blue:          'var(--gh-blue)',
          violet:        'var(--gh-violet)',
          gold:          'var(--gh-gold)',
          teal:          'var(--gh-teal)',
          success:       'var(--gh-success)',
          danger:        'var(--gh-danger)',
          'bg-base':     'var(--gh-bg-base)',
          'bg-surface':  'var(--gh-bg-surface)',
          'bg-elevated': 'var(--gh-bg-elevated)',
          'bg-input':    'var(--gh-bg-input)',
          'text':        'var(--gh-text-primary)',
          'text-sec':    'var(--gh-text-secondary)',
          'text-muted':  'var(--gh-text-muted)',
          'badge-gold':  'var(--gh-badge-gold)',
          'badge-silver':'var(--gh-badge-silver)',
          'badge-bronze':'var(--gh-badge-bronze)',
        },
      },
    },
  },
  plugins: [],
}

export default config
