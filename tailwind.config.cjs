module.exports = {
  content: ['./*.html', './*.js', './scripts/*template.html', './debug/*.{html,js}'],
  darkMode: 'class',
  theme: { extend: {
    colors: { roblox: { bgs: '#00f0ff', bgsi: '#ff007f', darkBg: '#0b0d17', cardBg: '#15192d', cardBorder: '#262d4a' } },
    fontFamily: { sans: ['Inter', 'sans-serif'] }
  } },
};
