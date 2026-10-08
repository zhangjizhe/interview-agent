/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        blue: { 50: '#eef0ff', 100: '#e0e4ff', 200: '#c7ceff', 300: '#a3acfa', 400: '#8089f0', 500: '#6366e4', 600: '#4f46c8', 700: '#4239ae', 800: '#37318c', 900: '#302d70' },
        slate: { 50: '#f7f7f4', 100: '#efefeb', 200: '#e2e3df', 300: '#c9ccc8', 400: '#8a9297', 500: '#68727d', 600: '#505b68', 700: '#3c4655', 800: '#2c3543', 900: '#202938' },
      },
    },
  },
  plugins: [],
};
