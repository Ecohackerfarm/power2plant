import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      keyframes: {
        slideOutLeft: {
          from: { transform: 'translateX(0)', opacity: '1' },
          to:   { transform: 'translateX(-110%)', opacity: '0' },
        },
        slideOutRight: {
          from: { transform: 'translateX(0)', opacity: '1' },
          to:   { transform: 'translateX(110%)', opacity: '0' },
        },
        slideInFromRight: {
          from: { transform: 'translateX(110%)', opacity: '0' },
          to:   { transform: 'translateX(0)', opacity: '1' },
        },
        slideInFromLeft: {
          from: { transform: 'translateX(-110%)', opacity: '0' },
          to:   { transform: 'translateX(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-out-left':  'slideOutLeft 280ms ease-in forwards',
        'slide-out-right': 'slideOutRight 280ms ease-in forwards',
        'slide-in-right':  'slideInFromRight 280ms ease-out forwards',
        'slide-in-left':   'slideInFromLeft 280ms ease-out forwards',
      },
    },
  },
  plugins: [],
}
export default config
