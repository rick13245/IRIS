/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx,js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        cockpit: {
          bg: '#0a0f1f',
          glass: 'rgba(255, 255, 255, 0.3)',
          neon: '#00e5ff',
          neonPink: '#ff00e5',
          danger: '#ff3b3b',
        },
        india: {
          saffron: '#FF9933',
          white: '#FFFFFF',
          green: '#138808',
          navy: '#000080',
          gold: '#FFD700',
        },
      },
      boxShadow: {
        neon: '0 0 20px rgba(0, 229, 255, 0.6)',
        danger: '0 0 20px rgba(255, 59, 59, 0.6)',
        india: '0 0 20px rgba(255, 153, 51, 0.4)',
        saffron: '0 0 15px rgba(255, 153, 51, 0.5)',
        green: '0 0 15px rgba(19, 136, 8, 0.5)',
      },
      backdropBlur: {
        cockpit: '8px'
      }
    },
  },
  plugins: [],
}


