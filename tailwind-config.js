// Shared Tailwind (Play CDN) theme — loaded right after the CDN script on every page.
tailwind.config = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        roblox: {
          bgs: '#00f0ff',
          bgsi: '#ff007f',
          darkBg: '#0b0d17',
          cardBg: '#15192d',
          cardBorder: '#262d4a'
        }
      },
      fontFamily: { sans: ['Inter', 'sans-serif'] }
    }
  }
}
