import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
export async function versionAssets(directory) {
  const files = [];
  async function walk(folder) { for (const entry of await readdir(folder, { withFileTypes: true })) { const file = path.join(folder, entry.name); if (entry.isDirectory()) await walk(file); else if (/\.(?:html|js|mjs|css)$/.test(file)) files.push(file); } }
  await walk(directory); files.sort();
  const hash = createHash('sha256');
  for (const file of files) hash.update(path.relative(directory,file)).update(await readFile(file));
  const version = hash.digest('hex').slice(0,12);
  for (const file of files) {
    if (file.endsWith('.css')) continue;
    let text = await readFile(file,'utf8');
    text = text.replace(/((?:src|href)=["'])(?!https?:|\/\/)([^"']+?\.(?:js|mjs|css))(?:\?[^"']*)?(["'])/g, `$1$2?v=${version}$3`);
    text = text.replace(/((?:from\s+|import\s+)["'])(\.[^"']+?\.(?:mjs|js))(?:\?[^"']*)?(["'])/g, `$1$2?v=${version}$3`);
    await writeFile(file,text);
  }
  return version;
}
