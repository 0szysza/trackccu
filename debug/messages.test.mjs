import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, validateRoutes, loadSamples, randomJob, sendDebugMessage } from './messages.js';

const webhook = 'https://discord.com/api/webhooks/123/TestToken';
const routes = Object.fromEntries(CATEGORIES.map(category => [category, webhook]));
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
const samples = Object.fromEntries(CATEGORIES.map(category => [category, [{ name: 'First' }, { name: 'Second' }]]));

test('Debug samples load published BGSI data and select one entry per category', async () => {
  const result = await loadSamples({ fetchImpl: async path => path.endsWith('live.json')
    ? response({ games: [{ slug: 'bgsi', name: 'Original', liveName: 'Current' }] })
    : response({ games: { bgsi: samples } }) });
  assert.equal(randomJob(result, 'updates').item.name, 'Current');
  for (const category of ['events', 'passes', 'products']) assert.equal(randomJob(result, category, () => 0.9).item.name, 'Second');
  assert.throws(() => randomJob({}, 'events'), /No sample/);
  await assert.rejects(loadSamples({ fetchImpl: async () => response({}, 404) }), /404/);
});
test('Incomplete and unrelated webhook routes are rejected before sending', () => {
  assert.equal(validateRoutes(routes), routes);
  assert.throws(() => validateRoutes({ updates: webhook }), /Missing/);
  assert.throws(() => validateRoutes({ ...routes, products: 'https://example.com/endpoint' }), /Invalid/);
  assert.throws(() => randomJob(samples, 'unknown'), /Unknown/);
});
test('Browser debug sends one labeled embed to Discord and pings only when enabled', async () => {
  for (const ping of [false, true]) {
    const job = randomJob(samples, 'events', () => 0.9);
    const result = await sendDebugMessage({ job, webhook, ping, fetchImpl: async (url, options) => {
      const payload = JSON.parse(options.body);
      assert.equal(url.searchParams.get('wait'), 'true');
      assert.equal(payload.embeds.length, 1);
      assert.equal(payload.embeds[0].title, 'Second');
      assert.match(payload.embeds[0].footer.text, /Test/);
      assert.equal(payload.attachments, undefined);
      assert.equal(payload.content, ping ? '@everyone' : '');
      assert.deepEqual(payload.allowed_mentions.parse, ping ? ['everyone'] : []);
      return response({ id: 'message', channel_id: 'channel', mention_everyone: ping, embeds: [{}] });
    } });
    assert.ok(result.url.endsWith('/channel/message'));
    assert.equal(result.pinged, ping);
  }
});
test('Unconfirmed sends are not automatically repeated and rate limits show retry time', async () => {
  let calls = 0;
  const job = randomJob(samples, 'updates');
  await assert.rejects(sendDebugMessage({ job, webhook, fetchImpl: async () => { calls++; throw new Error('network'); } }), /Check the channel/);
  assert.equal(calls, 1);
  await assert.rejects(sendDebugMessage({ job, webhook, fetchImpl: async () => response({ retry_after: 3.3 }, 429) }), /4 s/);
  await assert.rejects(sendDebugMessage({ job, webhook, fetchImpl: async () => response({ id: 'message', channel_id: 'channel', embeds: [] }) }), /Message delivery was not confirmed/);
});
