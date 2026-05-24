/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        haas: ['"Neue Haas Grotesk Display Pro 55 Roman"', '"Neue Haas Grotesk Text Pro"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
        'haas-text': ['"Neue Haas Grotesk Text Pro"', '"Helvetica Neue"', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
