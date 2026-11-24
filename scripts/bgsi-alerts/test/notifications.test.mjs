import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME, CATEGORIES, emptyState, planNotifications, allPages, collectSnapshot } from '../core.mjs';
import { alertHtml } from '../render.mjs';
import { sendNotification, deliverQueue, validateWebhook } from '../delivery.mjs';
import { GitHubState } from '../state.mjs';
import { prepare } from '../main.mjs';
import { getPublishedPlaceVersion } from '../details.mjs';
import { buildEmbed, embedCharacters, webhookPayload } from '../../../shared/bgsi-embeds.mjs';

const time = '2026-10-09T20:00:00.000Z';
const game = { ...GAME, name: GAME.name, updatedAt: '2026-10-09T14:00:00.000Z', description: 'Current game description', playing: 7000, favorites: 291000 };
const snapshot = (overrides = {}) => ({ observedAt: time, updates: { ...game }, events: [{ id: 'event-1', name: 'Upcoming event', start: '2026-10-10T18:00:00Z', end: '2026-10-12T18:00:00Z' }], passes: [{ id: 'pass-1', name: 'Existing pass', price: 100, isForSale: true }], products: [{ id: 'product-1', name: 'Existing product', price: 50, isForSale: true }], errors: {}, ...overrides });
const baseline = () => planNotifications(emptyState(), snapshot(), time).state;
const fakeWebhook = 'https://discord.com/api/webhooks/123456789012345678/TEST_TOKEN';
const hooks = Object.fromEntries(CATEGORIES.map((category, index) => [category, `https://discord.com/api/webhooks/${123456789012345670n + BigInt(index)}/TEST_TOKEN`]));
const queued = () => planNotifications(baseline(), snapshot({ updates: { ...game, updatedAt: '2026-10-09T19:00:00Z' }, passes: [...snapshot().passes, { id: 'pass-2', name: 'New pass', price: 200, isForSale: true }] }), time).state;
const response = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('First run records all four baselines without announcing existing content', () => {
  const result = planNotifications(emptyState(), snapshot(), time);
  assert.equal(result.added.length, 0);
  assert.equal(result.state.queue.length, 0);
  assert.deepEqual(Object.keys(result.state.baseline).sort(), [...CATEGORIES].sort());
  assert.deepEqual(result.state.seen.products, ['product-1']);
});
test('Unchanged poll does not generate an alert or change history', () => {
  const result = planNotifications(baseline(), snapshot(), time);
  assert.equal(result.changed, false);
  assert.equal(result.added.length, 0);
});
test('New update, event, pass and product are routed separately and deduplicated', () => {
  const input = snapshot({ updates: { ...game, updatedAt: '2026-10-09T19:00:00Z' }, events: [...snapshot().events, { id: 'event-2', name: 'New event', end: '2026-10-20T18:00:00Z' }], passes: [...snapshot().passes, { id: 'pass-2', name: 'New pass' }, { id: 'pass-2', name: 'Duplicate API entry' }], products: [...snapshot().products, { id: 'product-2', name: 'New product' }] });
  const first = planNotifications(baseline(), input, time);
  assert.deepEqual(first.added.map(job => job.category).sort(), [...CATEGORIES].sort());
  assert.equal(new Set(first.added.map(job => job.key)).size, 4);
  assert.equal(planNotifications(first.state, input, time).added.length, 0);
});
test('Older or cached game timestamps never cause a repeated update ping', () => {
  const result = planNotifications(baseline(), snapshot({ updates: { ...game, updatedAt: '2026-10-08T12:00:00Z' } }), time);
  assert.equal(result.added.length, 0);
  assert.equal(result.state.lastUpdateAt, game.updatedAt);
});
test('A failed source retains its baseline and known IDs while healthy sources continue', () => {
  const result = planNotifications(baseline(), snapshot({ products: undefined, passes: [...snapshot().passes, { id: 'new-pass' }], errors: { products: 'HTTP 429' } }), time);
  assert.deepEqual(result.state.seen.products, ['product-1']);
  assert.equal(result.state.baseline.products, time);
  assert.equal(result.added.length, 1);
  assert.equal(result.added[0].category, 'passes');
});
test('Empty lists and reappearing IDs do not wipe history or trigger false new-item alerts', () => {
  const empty = planNotifications(baseline(), snapshot({ passes: [] }), time).state;
  assert.deepEqual(empty.seen.passes, ['pass-1']);
  assert.equal(planNotifications(empty, snapshot(), time).added.length, 0);
});
test('Old archived events are remembered without announcing them as upcoming', () => {
  const input = snapshot({ events: [...snapshot().events, { id: 'old-event', end: '2026-09-01T00:00:00Z' }] });
  const result = planNotifications(baseline(), input, time);
  assert.equal(result.added.length, 0);
  assert.ok(result.state.seen.events.includes('old-event'));
});
test('Pagination loads all products and refuses partial or repeated-cursor responses', async () => {
  const urls = [];
  const items = await allPages('https://apis.roblox.com/example', 'items', 'next', 'cursor', async url => { urls.push(url); return urls.length === 1 ? { items: [{ id: 1 }], next: 'second' } : { items: [{ id: 2 }], next: '' }; });
  assert.equal(items.length, 2);
  assert.equal(new URL(urls[1]).searchParams.get('cursor'), 'second');
  await assert.rejects(allPages('https://apis.roblox.com/example', 'items', 'next', 'cursor', async () => ({ items: [], next: 'repeat' })), /Repeated/);
  await assert.rejects(allPages('https://apis.roblox.com/example', 'items', 'next', 'cursor', async () => ({ next: '' })), /Incomplete/);
});
test('One failed API does not discard the other three fresh snapshots', async () => {
  const result = await collectSnapshot(async url => {
    if (url.includes('/v1/games?')) return { data: [{ id: Number(GAME.universeId), name: GAME.name, updated: game.updatedAt }] };
    if (url.includes('game-passes')) return { gamePasses: [{ id: 123, name: 'Pass' }] };
    if (url.includes('developer-products')) throw new Error('HTTP 429');
    return { data: [{ id: 'event-1', title: 'Event', eventVisibility: 'public', eventTime: { startUtc: time, endUtc: '2026-10-20T00:00:00Z' } }] };
  });
  assert.equal(result.updates.name, GAME.name);
  assert.equal(result.passes.length, 1);
  assert.equal(result.events.length, 1);
  assert.equal(result.products, undefined);
  assert.equal(result.errors.products, 'HTTP 429');
});
test('Roblox strings are escaped in HTML cards and cannot become scripts', () => {
  const html = alertHtml({ category: 'passes', item: { id: '123', name: '<script>evil()</script>', description: '<img src=x onerror=evil()>', isForSale: true, price: 100 }, game, detectedAt: time });
  assert.ok(html.includes('&lt;script&gt;evil()&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=evil()&gt;'));
  assert.ok(!html.includes('<script>'));
});
test('Event embeds keep their subtitle, long description and relative dates', () => {
  const embed = buildEmbed({ category: 'events', item: { ...snapshot().events[0], subtitle: 'Northern Lights', description: 'x'.repeat(1200) }, detectedAt: time });
  assert.ok(embed.description.startsWith('**_Northern Lights_**'));
  assert.ok(embed.description.endsWith('x'.repeat(1200)));
  assert.match(embed.fields[0].value, /^<t:\d+:R>$/);
});

test('Store embeds include price, description, dates and the Roblox thumbnail', () => {
  const iconUrl = 'https://tr.rbxcdn.com/icon.png';
  const embed = buildEmbed({ category: 'products', item: { name: 'Bundle', price: 1299, iconUrl, created: time }, detectedAt: time });
  assert.equal(embed.title, 'New: Bundle');
  assert.deepEqual(embed.thumbnail, { url: iconUrl });
  assert.deepEqual(embed.fields.map(field => field.name), ['Price', 'Description', 'Created', 'Updated']);
  assert.equal(embed.fields[0].value, '1,299 Robux');
  assert.equal(embed.fields[1].value, '_No description provided_');
});

test('Long event embeds are split across messages without exceeding the Discord limit', async () => {
  const state = emptyState();
  state.queue = Array.from({ length: 3 }, (_, index) => ({
    key: `event-${index}`, status: 'pending', category: 'events', item: { id: index, description: '😀'.repeat(2500) },
  }));
  assert.throws(() => webhookPayload(state.queue), /message limit/);
  const sent = await deliverQueue(state, { hooks, store: { write: async () => {} }, send: async (_url, jobs) => {
    const payload = webhookPayload(jobs);
    assert.equal(payload.content, '@everyone');
    assert.deepEqual(payload.allowed_mentions, { parse: ['everyone'] });
    assert.equal(payload.embeds.length, 1);
    assert.ok(embedCharacters(payload.embeds[0]) <= 6000);
    return { id: 'message', channelId: 'events' };
  } });
  assert.equal(sent, 3);
  assert.equal(state.delivered.length, 3);
});

test('The published starting-place version is read only through authorized Roblox history', async () => {
  assert.equal(await getPublishedPlaceVersion({ apiKey: '', fetchImpl: async () => assert.fail() }), null);
  const cursors = [];
  const version = await getPublishedPlaceVersion({ apiKey: 'MockKey', fetchImpl: async (url, options) => {
    assert.match(url.pathname, /85896571713843\/history$/);
    assert.equal(url.searchParams.get('isPublished'), 'true');
    assert.equal(options.headers['x-api-key'], 'MockKey');
    const cursor = url.searchParams.get('cursor');
    cursors.push(cursor);
    return cursor ? response({ placeVersions: [{ version: '43' }], hasMore: false })
      : response({ placeVersions: [{ version: 41 }], hasMore: true, nextCursor: 'next' });
  } });
  assert.deepEqual(cursors, [null, 'next']);
  assert.equal(version, 43);
  const job = { category: 'updates', item: game, detectedAt: time };
  assert.ok(!alertHtml(job).includes('Place version'));
  assert.match(alertHtml({ ...job, item: { ...game, placeVersion: version } }), /Place version<\/span><strong>43<\/strong>/);
});

test('Update alerts upload one PNG with the existing everyone mention', async () => {
  const jobs = queued().queue.filter(job => job.category === 'updates');
  const result = await sendNotification(fakeWebhook, jobs, {
    renderUpdate: async job => { assert.equal(job.category, 'updates'); return new Uint8Array([137, 80, 78, 71]); },
    fetchImpl: async (_url, options) => {
      const payload = JSON.parse(options.body.get('payload_json'));
      assert.equal(payload.embeds, undefined);
      assert.equal(payload.content, '@everyone');
      assert.equal(options.body.get('files[0]').type, 'image/png');
      return response({ id: 'message', channel_id: 'channel', mention_everyone: true, attachments: [{}] });
    },
  });
  assert.equal(result.channelId, 'channel');
});

test('Live Discord sends use JSON with the intended embed and confirm the everyone mention', async () => {
  let seen;
  const jobs = queued().queue.filter(item => item.category === 'passes');
  const result = await sendNotification(fakeWebhook, jobs, { fetchImpl: async (url, options) => {
    seen = { url, payload: JSON.parse(options.body), headers: options.headers };
    return response({ id: 'message-1', channel_id: 'channel-1', mention_everyone: true, embeds: [{}] });
  } });
  assert.equal(new URL(seen.url).searchParams.get('wait'), 'true');
  assert.equal(seen.headers['content-type'], 'application/json');
  assert.equal(seen.payload.embeds[0].title, 'New: New pass');
  assert.equal(seen.payload.attachments, undefined);
  assert.equal(result.channelId, 'channel-1');
  await assert.rejects(sendNotification(fakeWebhook, jobs, { fetchImpl: async () =>
    response({ id: 'message-1', channel_id: 'channel-1', mention_everyone: false, embeds: [{}] }) }),
  error => error.uncertain === true);
});
test('Known rate limits are retried; connection failures remain uncertain and are not blindly resent', async () => {
  let count = 0;
  const jobs = queued().queue.filter(item => item.category === 'passes');
  await sendNotification(fakeWebhook, jobs, { wait: async () => {}, fetchImpl: async () => ++count === 1 ? response({ retry_after: 0.001 }, 429) : response({ id: 'message', channel_id: 'channel', mention_everyone: true, embeds: [{}] }) });
  assert.equal(count, 2);
  await assert.rejects(sendNotification(fakeWebhook, jobs, { fetchImpl: async () => { throw new Error('network'); } }), error => error.uncertain === true);
});
test('Persisting state precedes every send, each type uses its own webhook, and success is deduplicated after restart', async () => {
  const state = queued(), writes = [], sent = [];
  const store = { write: async value => { writes.push(structuredClone(value)); } };
  await deliverQueue(state, { store, hooks, send: async (hook, jobs) => {
    assert.ok(writes.at(-1).queue.some(job => job.key === jobs[0].key && job.status === 'sending'));
    assert.equal(hook, hooks[jobs[0].category]);
    sent.push(jobs[0].category);
    return { id: 'message', channelId: jobs[0].category };
  } });
  assert.deepEqual(sent, ['updates', 'passes']);
  assert.equal(state.queue.length, 0);
  assert.equal(state.delivered.length, 2);
  const planned = planNotifications(state, snapshot({ updates: { ...game, updatedAt: '2026-10-09T19:00:00Z' }, passes: [...snapshot().passes, { id: 'pass-2' }] }), time);
  assert.equal(planned.added.length, 0);
});
test('Rejected sends remain pending while uncertain sends are not pinged a second time', async () => {
  for (const uncertain of [false, true]) {
    const state = queued(), writes = [];
    const error = new Error('send failed'); error.uncertain = uncertain;
    await assert.rejects(deliverQueue(state, { store: { write: async value => writes.push(structuredClone(value)) }, hooks, send: async () => { throw error; } }), /send failed/);
    assert.equal(state.queue[0].status, uncertain ? 'uncertain' : 'pending');
    assert.equal(state.delivered.length, 0);
    if (uncertain) {
      const onlyUncertain = { ...state, queue: state.queue.filter(job => job.status === 'uncertain') };
      assert.equal(await deliverQueue(onlyUncertain, { store: { write: async () => assert.fail() }, hooks, send: async () => assert.fail() }), 0);
    }
  }
});
test('Invalid state is refused instead of announcing all existing content as new', () => {
  assert.throws(() => planNotifications({ ...baseline(), version: 99 }, snapshot(), time), /Invalid/);
});
test('GitHub state read failures never silently initialize a fresh baseline', async () => {
  let count = 0;
  const store = new GitHubState({ token: 'TEST', repository: 'owner/repo', fetchImpl: async () => ++count === 1 ? response({}) : response({}, 503) });
  await assert.rejects(store.read(), /refusing to reset history/);
});
test('GitHub state writes use the prior file SHA and update it from confirmation', async () => {
  let payload;
  const store = new GitHubState({ token: 'TEST', repository: 'owner/repo', fetchImpl: async (url, options) => { payload = JSON.parse(options.body); return response({ content: { sha: 'new-sha' } }); } });
  store.sha = 'old-sha';
  await store.write(baseline());
  assert.equal(payload.sha, 'old-sha');
  assert.equal(payload.branch, 'bgsi-alert-state');
  assert.equal(store.sha, 'new-sha');
});
test('Duplicate triggers skip polling briefly while retaining pending work', async () => {
  const state = { ...queued(), checkedAt: new Date().toISOString() };
  const result = await prepare({ store: { read: async () => state, write: async () => assert.fail() }, collect: async () => assert.fail() });
  assert.equal(result.queue.length, 2);
});
test('Incomplete snapshots still persist successful detections without dropping queued jobs', async () => {
  const writes = [];
  const result = await prepare({ force: true, store: { read: async () => baseline(), write: async value => writes.push(value) }, collect: async () => snapshot({ products: undefined, passes: [...snapshot().passes, { id: 'new' }], errors: { products: 'HTTP 429' } }) });
  assert.equal(result.queue.length, 1);
  assert.equal(writes.length, 1);
  assert.deepEqual(result.seen.products, ['product-1']);
});
test('Webhook configuration accepts only Discord incoming webhook URLs', () => {
  assert.equal(validateWebhook(fakeWebhook, 'updates'), fakeWebhook);
  assert.throws(() => validateWebhook('https://example.com/api/webhooks/123/abc', 'updates'), /Invalid/);
});
