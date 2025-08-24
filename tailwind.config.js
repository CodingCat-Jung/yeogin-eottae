// tailwind.config.js
module.exports = {
  content: [
    './index.html',
    './app/**/*.{js,ts,jsx,tsx}',
    './app/styles/app.css', // ✅ 이 줄 추가!
  ],
  theme: {
    extend: {
      colors: {
        primary: '#3F30C4',
      },
      fontFamily: {
        'sans': ['Pretendard', 'sans-serif'],
      },
      borderRadius: {
        xl: '2rem',
      },
      animation: {
        'pulse-slow': 'pulse 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
