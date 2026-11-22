import { mkdir, cp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const out = process.env.OUT_DIR || '_site';
execFileSync(process.execPath, ['node_modules/tailwindcss/lib/cli.js', '-c', 'tailwind.config.cjs', '-i', 'styles/tailwind.css', '-o', 'utility.css', '--minify'], { stdio: 'inherit' });
await mkdir(out, { recursive: true });
for (const name of ['index.html', '404.html', 'games.html', 'groups.html', 'compare.html', 'lookup.html', 'lookup.js', 'group-lookup.html', 'group-lookup.js', 'site.js', 'chart-tools.js', 'contact.js', 'group-page.js', 'site.css', 'utility.css', 'rebirth-logo.svg', 'favicon.ico', 'favicon.png', 'favicon-32.png', 'apple-touch-icon.png', 'manifest.webmanifest', 'sw.js', 'offline.html']) await cp(name, path.join(out, name));
await cp('assets', path.join(out, 'assets'), { recursive: true, filter: source => !source.endsWith('.html') && !source.endsWith('README.md') });
await cp('shared', path.join(out, 'shared'), { recursive: true });
await cp('scripts/config.static.js', path.join(out, 'config.js'));
await mkdir(path.join(out, 'debug'), { recursive: true });
for (const name of ['index.html', 'debug.css', 'debug.js', 'messages.js']) await cp(path.join('debug', name), path.join(out, 'debug', name));
// Deliberately public at the owner's request; never include this file in logs.
await cp('.github/bgsi-webhooks.json', path.join(out, 'debug/webhooks.json'));
execFileSync(process.execPath, ['scripts/sync-games.mjs'], { stdio: 'inherit', env: { ...process.env, OUT_DIR: out } });
const { versionAssets } = await import('./version-assets.mjs');
await versionAssets(out);
const { verifyBuild } = await import('./verify-build.mjs');
await verifyBuild(out);
