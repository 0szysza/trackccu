import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { GAME, LABELS, getJson } from './core.mjs';
import { escapeHtml, renderEmojiText, loadAppleEmojiImages } from './emoji.mjs';
export { escapeHtml } from './emoji.mjs';

const number = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US').format(value) : '—';
const icon = name => {
  const shapes = { chart: '<path d="M3 3v18h18M7 14l4-4 4 3 5-7"/>', clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>', gift: '<path d="M20 12v9H4v-9m-2-5h20v5H2zM12 7v14"/><path d="M12 7H7.5A2.5 2.5 0 1 1 10 4.5L12 7Zm0 0h4.5A2.5 2.5 0 1 0 14 4.5L12 7Z"/>', calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>', robux: '<path d="m12 2 9 5v10l-9 5-9-5V7z"/><path d="m12 7 4.5 2.5v5L12 17l-4.5-2.5v-5z"/>', arrow: '<path d="M7 17 17 7M7 7h10v10"/>', heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>' };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] || shapes.chart}</svg>`;
};
const formatDate = value => {
  if (!Number.isFinite(Date.parse(value))) return 'Unavailable';
  return new Intl.DateTimeFormat('en-US', { timeZone: process.env.ALERT_TIME_ZONE || 'Europe/Berlin', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));
};
const fact = (label, value, symbol = 'clock', accent = false) => `<div class="alert-fact"><span>${icon(symbol)}${escapeHtml(label)}</span><strong${accent ? ' class="accent"' : ''}>${escapeHtml(value)}</strong></div>`;
const fallbackArt = `<div class="fallback-art">${icon('gift')}<strong>BGSI</strong></div>`;
const image = (source, className) => source ? `<img class="${className}" src="${escapeHtml(source)}" alt="">` : fallbackArt;

export function alertHtml(job, { gameIcon = null, art = null, sharedCss = '', preview = false, emojiImages = new Map() } = {}) {
  const { category, item } = job;
  const richText = value => renderEmojiText(value, emojiImages);
  const game = job.game || GAME;
  const title = category === 'updates' ? (item.name || GAME.name) : item.name;
  const description = String(item.description || '').slice(0, 2500);
  let facts;
  if (category === 'updates') facts = fact('Updated', formatDate(item.updatedAt)) + fact('Players now', number(item.playing), 'users', true) + fact('Favorites', number(item.favorites), 'heart');
  else if (category === 'events') facts = fact('Starts', formatDate(item.start), 'calendar', true) + fact('Ends', formatDate(item.end), 'calendar') + fact('Status', Date.parse(item.start) > Date.parse(job.detectedAt) ? 'Upcoming' : 'Live now', 'clock');
  else facts = fact('Price', item.isForSale ? (Number.isFinite(item.price) ? `${number(item.price)} Robux` : 'Unavailable') : 'Off sale', 'robux', true) + fact('Created', formatDate(item.created)) + fact('Availability', item.isForSale ? 'On sale' : 'Off sale', 'gift');
  const subtitle = category === 'updates' ? `by ${item.creator || game.creator || 'Rumble Studios'}` : (item.subtitle || GAME.name);
  const descriptionHtml = description ? `<section class="description"><div class="section-label">${icon('chart')}${category === 'updates' ? 'GAME DESCRIPTION' : 'DESCRIPTION'}</div><p>${richText(description)}</p></section>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"><style>${sharedCss}
*{box-sizing:border-box}html{font-size:18px}body{margin:0;background:#0b0d17;font-family:Inter,Arial,sans-serif;color:#f8fafc}h1,h2,p{margin:0}svg{width:20px;height:20px;flex:none}#alert{width:1100px;padding:24px;background:#0b0d17}.alert-topbar{display:flex;align-items:center;justify-content:space-between;padding:0 4px 20px}.brand{display:flex;align-items:center;gap:12px;font-size:23px;font-weight:800}.brand svg{width:28px;height:28px;color:#34bfe5}.game-ident{display:flex;align-items:center;gap:10px;color:#94a3b8;font-size:16px;font-weight:650}.game-ident img{width:34px;height:34px;border-radius:9px}.game-pill{padding:7px 11px;border:1px solid #334155;border-radius:9px;background:#15192d;color:#34bfe5;font-size:13px;font-weight:800;letter-spacing:.08em}.alert-panel{overflow:hidden;border:1px solid #262d4a;border-radius:18px;background:#15192d}.alert-heading{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:24px 28px 18px}.section-label{display:flex;align-items:center;gap:8px;color:#75859f;font-size:12px;font-weight:800;letter-spacing:.15em}.section-label svg{width:16px;height:16px;color:#34bfe5}.alert-heading h1{margin-top:9px;font-size:23px;font-weight:800}.hero{display:grid;grid-template-columns:318px 1fr;align-items:center;gap:26px;margin:0 28px 24px}.hero.shop{grid-template-columns:168px 1fr;padding:22px;border:1px solid #293149;border-radius:14px;background:#111528}.hero-art{display:block;width:100%;height:180px;object-fit:cover;border:1px solid #293149;border-radius:13px;background:#0f172a}.shop .hero-art{height:150px;object-fit:contain;border:0;background:transparent}.fallback-art{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;min-height:150px;border:1px solid #293149;border-radius:13px;background:radial-gradient(ellipse at top,#253f62,#111528);color:#34bfe5}.fallback-art svg{width:54px;height:54px}.fallback-art strong{font-size:26px;letter-spacing:.06em}.item-kind{margin-bottom:9px;color:#34bfe5;font-size:12px;font-weight:800;letter-spacing:.15em}.hero h2{font-size:32px;line-height:1.22;font-weight:800;overflow-wrap:anywhere}.subtitle{margin-top:11px;color:#94a3b8;font-size:16px;line-height:1.45;overflow-wrap:anywhere}.alert-facts{display:grid;grid-template-columns:1.15fr 1.15fr 1fr;gap:12px;margin:0 28px 24px}.alert-fact{min-width:0;padding:16px 17px;border:1px solid #293149;border-radius:11px;background:#111528}.alert-fact>span{display:flex;align-items:center;gap:7px;margin-bottom:10px;color:#75859f;font-size:11px;font-weight:800;letter-spacing:.09em;text-transform:uppercase}.alert-fact svg{width:15px;height:15px;color:#34bfe5}.alert-fact strong{display:block;color:#f8fafc;font-size:18px;font-weight:800;line-height:1.5;overflow-wrap:anywhere}.alert-fact .accent{color:#34bfe5}.description{margin:0 28px 24px;padding-top:20px;border-top:1px solid #293149}.description p{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:9;overflow:hidden;margin-top:12px;color:#cbd5e1;font-size:17px;line-height:1.6;white-space:pre-line;overflow-wrap:anywhere}.alert-bottom{display:flex;justify-content:space-between;align-items:center;gap:18px;margin:0 28px;padding:15px 0 18px;border-top:1px solid #293149;color:#64748b;font-size:12px;font-weight:650}.source{display:flex;align-items:center;gap:5px;color:#34bfe5}.source svg{width:15px;height:15px}.preview{color:#fbbf24;letter-spacing:.04em}.macos-emoji{display:inline-block!important;width:1.08em!important;height:1.08em!important;margin:0 .015em;vertical-align:-.16em;object-fit:contain;border:0!important;border-radius:0!important;background:transparent!important}
</style></head><body><main id="alert"><header class="alert-topbar"><div class="brand">${icon('chart')}CCU Tracker</div><div class="game-ident">${gameIcon ? image(gameIcon, 'game-icon') : ''}<span>Bubble Gum Simulator INFINITY</span><span class="game-pill">BGSI</span></div></header><article class="alert-panel"><div class="alert-heading"><div><div class="section-label">${icon(category === 'events' ? 'calendar' : category === 'updates' ? 'chart' : 'gift')}BGSI NOTIFICATIONS</div><h1>${category === 'updates' ? 'Update detected' : category === 'events' ? 'New event' : category === 'passes' ? 'New game pass' : 'New developer product'}</h1></div></div><section class="hero${category === 'passes' || category === 'products' ? ' shop' : ''}">${image(art, 'hero-art')}<div><div class="item-kind">${LABELS[category]}</div><h2>${richText(title)}</h2><p class="subtitle">${richText(subtitle)}</p></div></section><section class="alert-facts">${facts}</section>${descriptionHtml}<footer class="alert-bottom"><span class="source">${icon('arrow')}Data from Roblox</span><span${preview ? ' class="preview"' : ''}>${preview ? 'PREVIEW · existing Roblox data' : 'Detected ' + escapeHtml(formatDate(job.detectedAt))}</span></footer></article></main></body></html>`;
}

const imageCache = new Map();
async function imageData(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const promise = (async () => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || !/(^|\.)rbxcdn\.com$/.test(parsed.hostname)) return null;
      const response = await fetch(parsed, { signal: AbortSignal.timeout(15000) });
      const mime = response.headers.get('content-type')?.split(';')[0].toLowerCase();
      if (!response.ok || !['image/png', 'image/jpeg', 'image/webp'].includes(mime)) return null;
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > 6 * 1024 * 1024) return null;
      return `data:${mime};base64,${bytes.toString('base64')}`;
    } catch { return null; }
  })();
  imageCache.set(url, promise);
  return promise;
}

async function thumbnail(url) {
  try { return (await getJson(url, { attempts: 2 })).data?.find(item => item.imageUrl)?.imageUrl || null; }
  catch { return null; }
}
let gameImages;
async function imagesFor(job) {
  if (!gameImages) gameImages = Promise.all([
    thumbnail(`https://thumbnails.roblox.com/v1/games/icons?universeIds=${GAME.universeId}&size=256x256&format=Png&isCircular=false`),
    getJson(`https://thumbnails.roblox.com/v1/games/multiget/thumbnails?universeIds=${GAME.universeId}&countPerUniverse=1&defaults=true&size=768x432&format=Png&isCircular=false`, { attempts: 2 }).then(data => data.data?.[0]?.thumbnails?.find(item => item.imageUrl)?.imageUrl || null).catch(() => null),
  ]);
  const [iconUrl, gameArtUrl] = await gameImages;
  let artUrl = job.item.iconUrl || job.item.thumbnailUrl;
  if (!artUrl && job.category === 'passes') artUrl = await thumbnail(`https://thumbnails.roblox.com/v1/game-passes?gamePassIds=${job.item.id}&size=150x150&format=Png&isCircular=false`);
  if (!artUrl && job.category === 'products') artUrl = await thumbnail(`https://thumbnails.roblox.com/v1/developer-products/icons?developerProductIds=${job.item.id}&size=150x150&format=Png&isCircular=false`);
  if (!artUrl && job.category === 'events' && job.item.thumbnailAssetId) artUrl = await thumbnail(`https://thumbnails.roblox.com/v1/assets?assetIds=${job.item.thumbnailAssetId}&size=768x432&format=Png&isCircular=false`);
  if (job.category === 'updates') artUrl = job.item.thumbnailUrl || job.game?.thumbnailUrl || gameArtUrl;
  return { gameIcon: await imageData(job.game?.iconUrl || iconUrl), art: await imageData(artUrl) };
}

export async function createRenderer() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.ALERT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.ALERT_CHROMIUM_EXECUTABLE } : {}) });
  const context = await browser.newContext({ viewport: { width: 1100, height: 1000 }, deviceScaleFactor: 2 });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname) ? route.continue() : route.abort();
  });
  const page = await context.newPage();
  const sharedCss = await readFile(new URL('../../site.css', import.meta.url), 'utf8');
  return {
    async render(job, output, { preview = false } = {}) {
      const images = await imagesFor(job);
      const emojiImages = await loadAppleEmojiImages([job.item.name, job.item.description, job.item.subtitle, job.item.creator, job.game?.name, job.game?.creator]);
      const html = alertHtml(job, { ...images, sharedCss, preview, emojiImages });
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
      await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode().catch(() => {}))); });
      await mkdir(path.dirname(output), { recursive: true });
      await page.locator('#alert').screenshot({ path: output, type: 'png' });
      return { output, html };
    },
    close: () => browser.close(),
  };
}
