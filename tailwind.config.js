/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", // Dòng này cực kỳ quan trọng để Tailwind quét code
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}