/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#140e1b', 900: '#1b1425', 800: '#251c33', 700: '#33273f', 600: '#4a3b5a' },
        sakura: { 200: '#f9cfdc', 300: '#f4a6c0', 400: '#ee80a6', 500: '#df5a8b' },
        lantern: { 300: '#ffd793', 400: '#ffb86b', 500: '#f59e3f' },
        wisteria: { 300: '#cbb8ff', 400: '#a98bff' },
        paper: '#f7ecdf'
      },
      fontFamily: {
        display: ['"Shippori Mincho"', 'serif'],
        sans: ['"Zen Maru Gothic"', 'system-ui', 'sans-serif']
      }
    }
  },
  plugins: []
};
