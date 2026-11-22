import globals from 'globals';
export default [
  { ignores: ['node_modules/**', '_site/**', '_checkpoint/**', 'legacy/**', 'assets/**'] },
  { files: ['**/*.{js,mjs,cjs}'], languageOptions: { ecmaVersion: 'latest', globals: { ...globals.browser, ...globals.node, Tracker: 'readonly', ChartTools: 'readonly', tailwind: 'readonly' } }, rules: { 'no-undef': 'error', 'no-unreachable': 'error', 'no-dupe-args': 'error' } },
];
