/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './lib/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Noto Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Sampled from the logo's teal-to-navy gradient mark (public/logo.png) —
        // 500 is the logo's dominant teal, 900 its darkest navy.
        brand: {
          50:  '#eefbf9',
          100: '#d7f2ee',
          200: '#afe4dc',
          300: '#7dcfc4',
          400: '#4ab3a7',
          500: '#2e9690',
          600: '#237a7d',
          700: '#1b5f6b',
          800: '#164b57',
          900: '#1e4d6b',
          950: '#193a4f',
        },
      },
    },
  },
  plugins: [],
};
