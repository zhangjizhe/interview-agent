/** @type {import('tailwindcss').Config} */
const ink = { 50: '#F8EFE8', 100: '#F3E4D8', 200: '#E7D3C4', 300: '#D4B8A4', 400: '#A07862', 500: '#8A5340', 600: '#8A5340', 700: '#73432F', 800: '#5C3626', 900: '#3F2C24' };
const paper = { 50: '#FBF6F1', 100: '#F6EFE8', 200: '#EFE4DA', 300: '#E4D5C8', 400: '#B7A094', 500: '#8A7266', 600: '#7C6458', 700: '#5C453C', 800: '#4A382F', 900: '#3F2C24' };
const pine = { 50: '#E7F3EC', 100: '#D5E8DC', 200: '#C5DDD0', 300: '#9BB8AA', 400: '#4E7A68', 500: '#3F6B52', 600: '#3F6B52', 700: '#2F5640', 800: '#244433', 900: '#1C3326' };
const seal = { 50: '#F8EEEB', 100: '#F0DDD7', 200: '#E7D0C9', 300: '#D7B3A9', 400: '#B56A5E', 500: '#8F3A32', 600: '#8F3A32', 700: '#732E28', 800: '#5C261F', 900: '#3E1A16' };
const brass = { 50: '#F8EFE8', 100: '#F3E4D8', 200: '#E7D3C4', 300: '#D4B8A4', 400: '#A07862', 500: '#8C4F38', 600: '#8A5340', 700: '#73432F', 800: '#5C3626', 900: '#3F2C24' };

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
        white: '#FFFCFA',
        black: '#3F2C24',
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
        sm: '8px',
        DEFAULT: '10px',
        md: '10px',
        lg: '12px',
        xl: '16px',
        '2xl': '18px',
        '3xl': '22px',
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
