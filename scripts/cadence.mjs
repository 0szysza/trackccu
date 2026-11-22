import { readFile, appendFile } from 'node:fs/promises';
const event = process.env.GITHUB_EVENT_NAME;
let collect = true;
if (['schedule', 'repository_dispatch'].includes(event)) {
  try {
    const manifest = JSON.parse(await readFile(`${process.env.CHECKPOINT_DIR || '_checkpoint'}/manifest.json`, 'utf8'));
    const age = Date.now() - Date.parse(manifest.savedAt);
    collect = !Number.isFinite(age) || age < 0 || age >= 150000;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
console.log(collect ? 'Collecting a fresh snapshot.' : 'A snapshot was saved less than 150 seconds ago; duplicate trigger skipped.');
if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `collect=${collect}\n`);
