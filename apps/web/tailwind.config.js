/** @type {import('tailwindcss').Config} */
const ink = { 50: '#F4F0E8', 100: '#E9E2D6', 200: '#DDD4C6', 300: '#CDBFAE', 400: '#8A8176', 500: '#5E564E', 600: '#1C1915', 700: '#3F3830', 800: '#2A261F', 900: '#141210' };
const paper = { 50: '#F3F0EA', 100: '#E8E2D8', 200: '#E3DCD2', 300: '#CFC6B8', 400: '#8A8176', 500: '#6F675E', 600: '#5E564E', 700: '#3F3830', 800: '#2A261F', 900: '#1C1915' };
const pine = { 50: '#E7F0EC', 100: '#D5E4DD', 200: '#C5DDD0', 300: '#9BB8AA', 400: '#4E7A68', 500: '#1E463C', 600: '#1E463C', 700: '#17382F', 800: '#123028', 900: '#0E241E' };
const seal = { 50: '#F8EEEB', 100: '#F0DDD7', 200: '#E7D0C9', 300: '#D7B3A9', 400: '#B56A5E', 500: '#8F3A32', 600: '#8F3A32', 700: '#732E28', 800: '#5C261F', 900: '#3E1A16' };
const brass = { 50: '#F8F1E3', 100: '#F0E4CC', 200: '#E7D7B4', 300: '#D4C093', 400: '#B0894F', 500: '#8A6A3B', 600: '#6F522C', 700: '#7A5410', 800: '#5C3F0C', 900: '#3E2C0C' };

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans"', '"Noto Sans SC"', '"PingFang SC"', 'sans-serif'],
        serif: ['Newsreader', '"Noto Serif SC"', 'serif'],
        mono: ['"IBM Plex Mono"', '"Noto Sans SC"', 'ui-monospace', 'monospace'],
      },
      colors: {
        white: '#FBFAF7',
        black: '#1C1915',
        blue: ink,
        slate: paper,
        zinc: paper,
        gray: paper,
        neutral: paper,
        stone: paper,
        indigo: ink,
        violet: brass,
        purple: brass,
        fuchsia: brass,
        cyan: pine,
        sky: pine,
        teal: pine,
        emerald: pine,
        green: pine,
        lime: pine,
        rose: seal,
        red: seal,
        pink: seal,
        amber: brass,
        yellow: brass,
        orange: brass,
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '2px',
        md: '2px',
        lg: '2px',
        xl: '4px',
        '2xl': '4px',
        '3xl': '4px',
      },
      boxShadow: {
        sm: '0 1px 1px rgba(28, 25, 21, 0.04)',
        DEFAULT: '0 1px 2px rgba(28, 25, 21, 0.05)',
        md: '0 8px 24px rgba(28, 25, 21, 0.05)',
        lg: '0 16px 40px rgba(28, 25, 21, 0.06)',
        xl: '0 24px 60px rgba(28, 25, 21, 0.08)',
        '2xl': '0 32px 70px rgba(28, 25, 21, 0.1)',
      },
    },
  },
  plugins: [],
};
