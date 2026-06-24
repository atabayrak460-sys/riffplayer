import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#a78bfa',
          dim: '#7c3aed',
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
