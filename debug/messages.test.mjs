import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, debugPayload, validateRoutes, loadPreview, sendDebugMessage } from './messages.js';

const webhook = 'https://discord.com/api/webhooks/123456789012345678/TEST_TOKEN';
const routes = Object.fromEntries(CATEGORIES.map(category => [category, webhook]));
const png = new Blob([Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' });
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('Each test type sends its own PNG attachment with empty text when ping is off', () => {
  for (const category of CATEGORIES) {
    const payload = debugPayload(category);
    assert.equal(payload.content, '');
    assert.equal(payload.attachments[0].filename, `bgsi-test-${category}.png`);
    assert.equal(payload.embeds, undefined);
    assert.deepEqual(payload.allowed_mentions.parse, []);
    assert.ok(!payload.content.includes('@everyone'));
  }
});
test('Ping control enables both the visible everyone mention and allowed mentions', () => {
  const payload = debugPayload('updates', true);
  assert.equal(payload.content, '@everyone');
  assert.deepEqual(payload.allowed_mentions.parse, ['everyone']);
});
test('Incomplete and unrelated webhook routes are rejected before sending', () => {
  assert.equal(validateRoutes(routes), routes);
  assert.throws(() => validateRoutes({ updates: webhook }), /Missing/);
  assert.throws(() => validateRoutes({ ...routes, products: 'https://example.com/endpoint' }), /Invalid/);
  assert.throws(() => debugPayload('unknown'), /Unknown/);
});
test('Preview loading rejects missing files and non-PNG error pages', async () => {
  assert.equal((await loadPreview('passes', { fetchImpl: async () => new Response(png) })).type, 'image/png');
  await assert.rejects(loadPreview('passes', { fetchImpl: async () => new Response('not found', { status: 404 }) }), /404/);
  await assert.rejects(loadPreview('passes', { fetchImpl: async () => new Response('<html>') }), /PNG/);
});
test('Browser test send uploads the selected PNG, targets the given webhook and returns a message link', async () => {
  let captured;
  const result = await sendDebugMessage({ category: 'events', webhook, image: png, ping: true, fetchImpl: async (url, options) => {
    captured = { url, payload: JSON.parse(options.body.get('payload_json')), image: options.body.get('files[0]') };
    return response({ id: 'message', channel_id: 'channel', mention_everyone: true, attachments: [{}] });
  } });
  assert.equal(new URL(captured.url).searchParams.get('wait'), 'true');
  assert.equal(captured.image.name, 'bgsi-test-events.png');
  assert.equal(captured.image.type, 'image/png');
  assert.equal(captured.payload.embeds, undefined);
  assert.ok(result.url.endsWith('/channel/message'));
  assert.equal(result.pinged, true);
});
test('Unconfirmed sends are not automatically repeated and rate limits show retry time', async () => {
  let calls = 0;
  await assert.rejects(sendDebugMessage({ category: 'updates', webhook, image: png, fetchImpl: async () => { calls++; throw new Error('network'); } }), /Check the channel/);
  assert.equal(calls, 1);
  await assert.rejects(sendDebugMessage({ category: 'passes', webhook, image: png, fetchImpl: async () => response({ retry_after: 3.3 }, 429) }), /4 s/);
  await assert.rejects(sendDebugMessage({ category: 'products', webhook, image: png, fetchImpl: async () => response({ id: 'message', channel_id: 'channel', attachments: [] }) }), /Image delivery was not confirmed/);
});
