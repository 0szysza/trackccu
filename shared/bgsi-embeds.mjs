import { executeWebhook } from './discord-webhook.mjs';

export const GAME = { slug: 'bgsi', universeId: '6504986360', placeId: '85896571713843', name: 'Bubble Gum Simulator INFINITY', siteUrl: 'https://0szysza.github.io/trackccu/games/85896571713843/' };
export const CATEGORIES = ['updates', 'events', 'passes', 'products'];
const labels = { updates: 'Game update', events: 'New event', passes: 'New game pass', products: 'New developer product' };
const colors = { updates: 0x34bfe5, events: 0xa78bfa, passes: 0x4ade80, products: 0xfbbf24 };
const number = new Intl.NumberFormat('en-US');
const count = value => Number.isFinite(value) ? number.format(value) : '—';
const field = (name, value) => ({ name, value, inline: true });
const clip = (value, max) => value.length > max ? value.slice(0, max - 1).replace(/[\uD800-\uDBFF]$/, '').trimEnd() + '…' : value;
const discordTime = value => {
  const stamp = Date.parse(value);
  return Number.isFinite(stamp) ? `<t:${Math.floor(stamp / 1000)}:f>` : '—';
};

export function buildEmbed({ category, item, detectedAt }, test = false) {
  if (!CATEGORIES.includes(category)) throw new Error('Unknown BGSI notification type.');
  const description = [item.subtitle, item.description].filter(Boolean).join('\n\n').trim();
  const id = /^\d+$/.test(item.id) ? item.id : null;
  const links = {
    events: id && `https://www.roblox.com/events/${id}`,
    passes: id && `https://www.roblox.com/game-pass/${id}`,
  };
  let fields;
  if (category === 'updates') {
    fields = [field('Updated', discordTime(item.updatedAt)), field('Players', count(item.playing)), field('Favorites', count(item.favorites))];
  } else if (category === 'events') {
    fields = [field('Starts', discordTime(item.start)), field('Ends', discordTime(item.end))];
  } else {
    fields = [field('Price', Number.isFinite(item.price) ? `${count(item.price)} Robux` : '—'), field('Availability', item.isForSale ? 'On sale' : 'Off sale')];
  }
  const stamp = Date.parse(detectedAt);
  return {
    author: { name: labels[category], ...(category === 'updates' ? { url: GAME.siteUrl } : {}) },
    title: clip(item.name?.trim() || (category === 'updates' ? GAME.name : 'Untitled'), 120),
    ...(links[category] ? { url: links[category] } : {}),
    ...(description ? { description: clip(description, 360) } : {}),
    color: colors[category],
    fields,
    footer: { text: test ? 'BGSI · TrackCCU · Test' : 'BGSI · TrackCCU' },
    ...(Number.isFinite(stamp) ? { timestamp: new Date(stamp).toISOString() } : {}),
  };
}

export function webhookPayload(jobs, { ping = true, test = false } = {}) {
  if (!jobs.length || jobs.length > 10) throw new Error('Discord requires 1–10 embeds per message.');
  if (jobs.some(job => job.category !== jobs[0].category)) throw new Error('Mixed notification categories.');
  return {
    username: 'BGSI · CCU Tracker',
    content: ping ? '@everyone' : '',
    allowed_mentions: { parse: ping ? ['everyone'] : [] },
    embeds: jobs.map(job => buildEmbed(job, test)),
  };
}

export async function postEmbeds(webhook, payload, { fetchImpl = fetch, wait, attempts = 1, requirePing = false } = {}) {
  const message = await executeWebhook(webhook, () => JSON.stringify(payload), {
    fetchImpl, wait, attempts,
    headers: { 'content-type': 'application/json' },
    verify: message => message.embeds?.length === payload.embeds.length && (!requirePing || message.mention_everyone === true),
  });
  return { id: message.id, channelId: message.channel_id, pinged: message.mention_everyone === true };
}
