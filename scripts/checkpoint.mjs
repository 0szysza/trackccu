import { readFile, writeFile, mkdir, access, appendFile } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRaw, validateExtras, writeJson } from './data-store.mjs';

export const FILES = ['raw.json', 'group-raw.json', 'extras.json', 'live.json', 'group-live.json'];
export function validateBundle(bundle) {
  if (bundle?.version !== 1 || !bundle.files) throw new Error('Invalid checkpoint');
  validateRaw(bundle.files['raw.json']); validateRaw(bundle.files['group-raw.json'], 'groups'); validateExtras(bundle.files['extras.json']);
  if (!Array.isArray(bundle.files['live.json']?.games) || !Array.isArray(bundle.files['group-live.json']?.groups)) throw new Error('Invalid live checkpoint');
  return bundle;
}
export async function readBundle(directory) {
  const files = Object.fromEntries(await Promise.all(FILES.map(async name => [name, JSON.parse(await readFile(path.join(directory, name), 'utf8'))])));
  return validateBundle({ version: 1, savedAt: new Date().toISOString(), files });
}
export function encodeBackup(bundle) { return gzipSync(JSON.stringify(validateBundle(bundle)), { level: 9 }); }
export function decodeBackup(bytes) { return validateBundle(JSON.parse(gunzipSync(bytes, { maxOutputLength: 128 * 1024 * 1024 }).toString('utf8'))); }
export async function restoreBackup(bytes, directory, { replace = false } = {}) {
  const bundle = decodeBackup(bytes);
  if (!replace) for (const name of FILES) {
    try { await access(path.join(directory, name)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    throw new Error(`Refusing to replace ${name}; pass --replace after keeping a copy`);
  }
  for (const [name, value] of Object.entries(bundle.files)) if (FILES.includes(name)) await writeJson(directory, name, value);
  return bundle;
}
export function persistState(checkpointDir, message = 'Save tracker checkpoint [skip ci]') {
  const git = args => execFileSync('git', ['-C', checkpointDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git(['config', 'user.name', 'github-actions[bot]']);
  git(['config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com']);
  git(['add', 'data', 'manifest.json']);
  let changed = false;
  try { git(['diff', '--cached', '--quiet']); } catch (error) { if (error.status !== 1) throw error; changed = true; }
  if (changed) {
    // Keep a single reachable snapshot; daily artifacts provide bounded recovery
    // history. Never append years of five-minute JSON commits to this branch.
    const previous = git(['rev-parse', 'HEAD']).trim();
    const tree = git(['write-tree']).trim();
    const commit = git(['commit-tree', tree, '-m', message]).trim();
    git(['push', `--force-with-lease=refs/heads/tracker-data:${previous}`, 'origin', `${commit}:refs/heads/tracker-data`]);
    git(['reset', '--soft', commit]);
  }
  return changed;
}
export function assertNotOlder(previous, next) {
  for (const [name, field] of [['raw.json', 'games'], ['group-raw.json', 'groups']]) {
    for (const [id, points] of Object.entries(previous.files[name][field])) {
      const after = next.files[name][field][id];
      if (!after || (points.length && points.at(-1)[0] >= Date.parse(next.savedAt)/1000-90*86400 && (!after.length || after.at(-1)[0] < points.at(-1)[0]))) throw new Error(`Refusing older checkpoint: ${name}/${id}`);
    }
  }
}
export async function verifyCheckpoint(directory) {
  let manifest;
  try { manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (manifest.version !== 1 || !manifest.sha256 || FILES.some(name => !manifest.sha256[name])) throw new Error('Invalid checkpoint manifest');
  for (const name of FILES) {
    const hash = createHash('sha256').update(await readFile(path.join(directory, 'data', name))).digest('hex');
    if (hash !== manifest.sha256[name]) throw new Error(`Checkpoint checksum mismatch: ${name}`);
  }
  return manifest;
}

export async function saveCheckpoint(source, checkpointDir, { backupDir = '_backups', persist = false } = {}) {
  const bundle = await readBundle(source);
  let old = {};
  try { old = JSON.parse(await readFile(path.join(checkpointDir, 'manifest.json'), 'utf8')); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (old.version) {
    await verifyCheckpoint(checkpointDir);
    const previous = await readBundle(path.join(checkpointDir, 'data'));
    assertNotOlder(previous, bundle);
  }
  const hashes = {};
  await mkdir(path.join(checkpointDir, 'data'), { recursive: true });
  for (const name of FILES) {
    // One sample per line keeps checkpoint diffs small without a database or
    // rewriting the source branch. JSON remains directly readable by collectors.
    const text = JSON.stringify(bundle.files[name]).replace(/\],(?=\[\d)/g, '],\n') + '\n';
    await writeFile(path.join(checkpointDir, 'data', name), text);
    hashes[name] = createHash('sha256').update(text).digest('hex');
  }
  const day = bundle.savedAt.slice(0, 10);
  await writeJson(checkpointDir, 'manifest.json', { ...old, version: 1, savedAt: bundle.savedAt, sha256: hashes });
  if (persist) persistState(checkpointDir);
  const required = old.backupDay !== day;
  const filename = path.resolve(backupDir, `checkpoint-${day}.json.gz`);
  if (required) { await mkdir(backupDir, { recursive: true }); await writeFile(filename, encodeBackup(bundle)); }
  return { required, filename, day };
}
export async function markBackup(checkpointDir, day, { persist = false } = {}) {
  const manifest = JSON.parse(await readFile(path.join(checkpointDir, 'manifest.json'), 'utf8'));
  await writeJson(checkpointDir, 'manifest.json', { ...manifest, backupDay: day });
  if (persist) persistState(checkpointDir, 'Confirm daily tracker backup [skip ci]');
}

async function main() {
  const mode = process.argv[2], checkpointDir = process.env.CHECKPOINT_DIR || '_checkpoint';
  if (mode === 'save') {
    const result = await saveCheckpoint(path.join(process.env.OUT_DIR || '_site', 'data'), checkpointDir, { persist: process.env.GITHUB_ACTIONS === 'true' });
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `backup_required=${result.required}\nbackup_day=${result.day}\nbackup_path=${result.filename}\n`);
  } else if (mode === 'verify') await verifyCheckpoint(checkpointDir);
  else if (mode === 'mark-backup') await markBackup(checkpointDir, process.argv[3], { persist: process.env.GITHUB_ACTIONS === 'true' });
  else if (mode === 'restore') await restoreBackup(await readFile(process.argv[3]), process.argv[4], { replace: process.argv.includes('--replace') });
  else throw new Error('Use checkpoint.mjs save | mark-backup DAY | restore FILE DIRECTORY [--replace]');
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main().catch(error => { console.error(error.message); process.exitCode = 1; });
