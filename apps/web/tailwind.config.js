/** @type {import('tailwindcss').Config} */
const ink = { 50: '#F4F1FC', 100: '#E9E4FA', 200: '#D9D2F6', 300: '#C4BAF0', 400: '#9B8BE8', 500: '#7A68E0', 600: '#6456DC', 700: '#5344C8', 800: '#4336A4', 900: '#23243A' };
const paper = { 50: '#F7F8FC', 100: '#F1F2F8', 200: '#E6E7F0', 300: '#D5D7E4', 400: '#9AA0B2', 500: '#656779', 600: '#545668', 700: '#3E4154', 800: '#2E3144', 900: '#232332' };
const pine = { 50: '#E7F6EE', 100: '#D3EDDF', 200: '#B7E0CB', 300: '#8FCBAA', 400: '#4E9A72', 500: '#2F7A58', 600: '#2F7A58', 700: '#246348', 800: '#1C4C38', 900: '#143628' };
const seal = { 50: '#FDECEF', 100: '#F8D5DC', 200: '#F0C2CC', 300: '#E49AAB', 400: '#D45A74', 500: '#C43B55', 600: '#C43B55', 700: '#A42E46', 800: '#7E2436', 900: '#541824' };
const brass = ink;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', '"Noto Sans SC"', '"PingFang SC"', 'sans-serif'],
        serif: ['"Plus Jakarta Sans"', '"Noto Sans SC"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Noto Sans SC"', 'ui-monospace', 'monospace'],
      },
      colors: {
        white: '#FFFFFF',
        black: '#23243A',
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
