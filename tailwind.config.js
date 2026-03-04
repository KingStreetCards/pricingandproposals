/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        teal: { DEFAULT: '#00BCD4', dark: '#00838F', light: '#B2EBF2', ghost: '#E0F7FA' },
        navy: { DEFAULT: '#1A2332', light: '#2D3748' },
        coral: '#FF6B6B',
      },
      fontFamily: {
        sans: ['"Nunito Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['Consolas', '"Courier New"', 'monospace'],
      },
    },
  },
  plugins: [],
};
