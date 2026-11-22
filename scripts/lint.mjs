import { ESLint } from 'eslint';
import { readdir, readFile } from 'node:fs/promises';
const eslint = new ESLint();
const results = await eslint.lintFiles(['*.js', '*.mjs', '*.cjs', 'shared', 'scripts', 'debug', '.github/scripts']);
for (const directory of ['.', 'scripts', 'debug']) for (const entry of await readdir(directory)) {
  if (!entry.endsWith('.html')) continue;
  const file = `${directory}/${entry}`, source = await readFile(file, 'utf8');
  let i = 0;
  for (const match of source.matchAll(/<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/application\/ld\+json|application\/json/.test(match[1])) continue;
    results.push(...await eslint.lintText(match[2], { filePath: `scripts/inline-${entry}-${i++}.js` }));
  }
}
const formatter = await eslint.loadFormatter('stylish');
const output = formatter.format(results); if (output) console.log(output);
if (results.some(result => result.errorCount)) process.exitCode = 1;
