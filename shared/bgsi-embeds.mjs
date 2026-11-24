import { executeWebhook } from './discord-webhook.mjs';

export const GAME = { slug: 'bgsi', universeId: '6504986360', placeId: '85896571713843', name: 'Bubble Gum Simulator INFINITY', siteUrl: 'https://0szysza.github.io/trackccu/games/85896571713843/' };
export const CATEGORIES = ['updates', 'events', 'passes', 'products'];
const colors = { events: 0x3498db, passes: 0x3498db, products: 0x00c4a7 };
const brandIcon = new URL('../../favicon.png', GAME.siteUrl).href;
export const EMBED_CHARACTER_LIMIT = 6000;
const number = new Intl.NumberFormat('en-US');
const field = (name, value, inline = true) => ({ name, value, inline });
const clip = (value, max) => value.length > max ? value.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd() + '…' : value;
const discordTime = value => {
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? `<t:${Math.floor(stamp / 1000)}:R>` : '—';
};
const robloxThumbnail = value => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)rbxcdn\.com$/.test(url.hostname) ? { url: url.href } : undefined;
  } catch { return undefined; }
};

export function buildEmbed({ category, item, detectedAt }, test = false) {
  if (!Object.hasOwn(colors, category)) throw new Error('Unknown BGSI embed type.');
  const name = item.name?.trim() || 'Untitled';
  const id = item.id == null ? null : encodeURIComponent(item.id);
  const stamp = Date.parse(detectedAt);
  const common = {
    color: colors[category],
    footer: { text: test ? 'TrackCCU · BGSI · Test' : 'TrackCCU · BGSI', icon_url: brandIcon },
    ...(Number.isFinite(stamp) ? { timestamp: new Date(stamp).toISOString() } : {}),
  };
  if (category === 'events') {
    const subtitle = item.subtitle?.trim();
    const description = [subtitle && `**_${subtitle}_**`, item.description?.trim()].filter(Boolean).join('\n\n');
    return {
      ...common,
      title: clip(name, 256),
      ...(id ? { url: `https://www.roblox.com/events/${id}` } : {}),
      ...(description ? { description: clip(description, 4096) } : {}),
      fields: [field('Starts', discordTime(item.start)), field('Ends', discordTime(item.end))],
    };
  }
  const thumbnail = robloxThumbnail(item.iconUrl);
  return {
    ...common,
    title: clip(`New: ${name}`, 256),
    ...(category === 'passes' && id ? { url: `https://www.roblox.com/game-pass/${id}/` } : {}),
    ...(thumbnail ? { thumbnail } : {}),
    fields: [
      field('Price', item.isForSale === false ? 'Off sale' : Number.isFinite(item.price) ? `${number.format(item.price)} Robux` : '—', false),
      field('Description', clip(item.description?.trim() || '_No description provided_', 1024), false),
      field('Created', discordTime(item.created)),
      field('Updated', discordTime(item.updated)),
    ],
  };
}

export function embedCharacters(embed) {
  return (embed.title?.length || 0) + (embed.description?.length || 0) + embed.footer.text.length
    + embed.fields.reduce((length, field) => length + field.name.length + field.value.length, 0);
}

function messagePayload(ping, content = '') {
  return {
    username: 'BGSI · CCU Tracker',
    content: [ping ? '@everyone' : '', content].filter(Boolean).join('\n'),
    allowed_mentions: { parse: ping ? ['everyone'] : [] },
  };
}

export function webhookPayload(jobs, { ping = true, test = false } = {}) {
  if (!jobs.length || jobs.length > 10) throw new Error('Discord requires 1–10 embeds per message.');
  if (jobs.some(job => job.category !== jobs[0].category)) throw new Error('Mixed notification categories.');
  const embeds = jobs.map(job => buildEmbed(job, test));
  if (embeds.reduce((size, embed) => size + embedCharacters(embed), 0) > EMBED_CHARACTER_LIMIT) throw new Error('Discord embed text exceeds the message limit.');
  return { ...messagePayload(ping), embeds };
}

export const UPDATE_IMAGE_PREVIEW = '../assets/debug/bgsi-updates.png';

export async function postUpdateImage(webhook, image, { ping = true, test = false, fetchImpl = fetch, wait, attempts = 1, requirePing = false } = {}) {
  const filename = test ? 'bgsi-test-update.png' : 'bgsi-update.png';
  const payload = { ...messagePayload(ping, test ? 'BGSI · TrackCCU · Test' : ''), attachments: [{ id: 0, filename }] };
  const message = await executeWebhook(webhook, () => {
    const form = new FormData();
    form.set('payload_json', JSON.stringify(payload));
    form.set('files[0]', image, filename);
    return form;
  }, { fetchImpl, wait, attempts, verify: message => message.attachments?.length === 1 && (!requirePing || message.mention_everyone === true) });
  return { id: message.id, channelId: message.channel_id, pinged: message.mention_everyone === true };
}

export async function postEmbeds(webhook, payload, { fetchImpl = fetch, wait, attempts = 1, requirePing = false } = {}) {
  const message = await executeWebhook(webhook, () => JSON.stringify(payload), {
    fetchImpl, wait, attempts,
    headers: { 'content-type': 'application/json' },
    verify: message => message.embeds?.length === payload.embeds.length && (!requirePing || message.mention_everyone === true),
  });
  return { id: message.id, channelId: message.channel_id, pinged: message.mention_everyone === true };
}
