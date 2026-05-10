import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
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
        brand: {
          orange:  '#fb923c',
          purple:  '#c084fc',
          gold:    '#f0c060',
          green:   '#22c55e',
          cyan:    '#22d3ee',
          red:     '#ef4444',
        },
      },
    },
  },
  plugins: [],
}

export default config
