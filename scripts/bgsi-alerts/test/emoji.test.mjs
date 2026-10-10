import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAppleEmojiIndex, renderEmojiText } from '../emoji.mjs';
import { alertHtml } from '../render.mjs';

const png = 'data:image/png;base64,iVBORw0KGgo=';
const data = [
  { unified: '1F341', image: '1f341.png', has_img_apple: true },
  { unified: '2601-FE0F', non_qualified: '2601', image: '2601.png', has_img_apple: true },
  { unified: '00A9-FE0F', non_qualified: '00A9', image: '00a9.png', has_img_apple: true },
  { unified: '1F468-200D-1F4BB', image: 'technologist.png', has_img_apple: false, skin_variations: { '1F3FD': { unified: '1F468-1F3FD-200D-1F4BB', image: '1f468-1f3fd-200d-1f4bb.png', has_img_apple: true } } },
  { unified: '1F1F5-1F1F1', image: '1f1f5-1f1f1.png', has_img_apple: true },
  { unified: '0031-FE0F-20E3', non_qualified: '0031-20E3', image: '0031-fe0f-20e3.png', has_img_apple: true },
];

test('Apple metadata resolves qualified symbols to their actual PNG filenames', () => {
  const index = buildAppleEmojiIndex(data);
  assert.equal(index.get('🍁'), '1f341.png');
  assert.equal(index.get('☁️'), '2601.png');
  assert.equal(index.get('☁'), '2601.png');
  assert.equal(index.has('©'), false);
  assert.equal(index.get('©️'), '00a9.png');
});
test('Joined emoji, skin tones, flags and keycaps remain complete graphemes', () => {
  const index = buildAppleEmojiIndex(data);
  const text = '👨🏽‍💻 🇵🇱 1️⃣';
  const images = new Map([...index.keys()].map(character => [character, png]));
  const html = renderEmojiText(text, images);
  assert.equal((html.match(/class="macos-emoji"/g) || []).length, 3);
  assert.ok(html.includes('alt="👨🏽‍💻"'));
  assert.ok(html.includes('alt="🇵🇱"'));
  assert.ok(html.includes('alt="1️⃣"'));
});
test('Emoji replacement preserves text escaping and refuses unsafe image sources', () => {
  const images = new Map([['🍁', png], ['🎃', 'javascript:alert(1)']]);
  const html = renderEmojiText('<script>🍁</script> & 🎃', images);
  assert.ok(html.startsWith('&lt;script&gt;'));
  assert.ok(html.includes('&lt;/script&gt; &amp; 🎃'));
  assert.ok(!html.includes('javascript:'));
  assert.equal(renderEmojiText('Plain text ©'), 'Plain text ©');
});
test('Notification titles and descriptions embed Apple images without reintroducing removed card controls', () => {
  const images = new Map([['🍁', png], ['🎃', png]]);
  const html = alertHtml({ category: 'events', item: { name: '🎃 Halloween', description: '🍁 New content', start: '2026-10-10T18:00:00Z', end: '2026-10-31T20:00:00Z' }, detectedAt: '2026-10-10T10:00:00Z' }, { emojiImages: images });
  assert.equal((html.match(/class="macos-emoji"/g) || []).length, 2);
  assert.ok(!html.includes('alert-tabs'));
  assert.ok(!html.includes('outer-footer'));
});
