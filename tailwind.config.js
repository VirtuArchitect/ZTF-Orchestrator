/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        nutanix: {
          blue: '#034ea2',
          'blue-light': '#1a6bbf',
          cyan: '#21c2f8',
          teal: '#00b388',
        },
        surface: {
          DEFAULT: '#1c1e2d',
          elevated: '#252840',
          'elevated-2': '#2e3255',
        },
        border: {
          DEFAULT: '#2e3150',
          light: '#3d4170',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
    },
  },
  plugins: [],
}
