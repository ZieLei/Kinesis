/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,jsx,ts,tsx}",
    "./src/components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      fontFamily: {
        inter: ['Inter-Regular'],
        'inter-regular': ['Inter-Regular'],
        'inter-thin': ['Inter-Thin'],
        'inter-extralight': ['Inter-ExtraLight'],
        'inter-light': ['Inter-Light'],
        'inter-medium': ['Inter-Medium'],
        'inter-semibold': ['Inter-SemiBold'],
        'inter-bold': ['Inter-Bold'],
        'inter-extrabold': ['Inter-ExtraBold'],
        'inter-black': ['Inter-Black'],

        fredoka: ['FredokaOne'],
      },
    },
  },
  plugins: [],
}

