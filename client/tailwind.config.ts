import type { Config } from 'tailwindcss'

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', 'Inter', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'Noto Sans', 'Apple Color Emoji','Segoe UI Emoji']
      },
      boxShadow: {
        soft: '0 4px 24px -6px rgba(16,24,40,0.12)'
      },
      colors: {
        brand: {
          50: '#ecfdf5',
          600: '#059669',
          700: '#047857'
        }
      }
    },
  },
  plugins: [],
} satisfies Config
