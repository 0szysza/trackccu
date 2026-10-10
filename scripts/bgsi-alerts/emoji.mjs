import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' });
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);

function fromSequence(sequence) {
  if (!/^[\da-f]+(?:-[\da-f]+)*$/i.test(sequence || '')) return null;
  const points = sequence.split('-').map(point => Number.parseInt(point, 16));
  if (points.some(point => point > 0x10ffff)) return null;
  return String.fromCodePoint(...points);
}

export function buildAppleEmojiIndex(data) {
  const index = new Map();
  const add = entry => {
    if (entry.has_img_apple !== true || !/^[\da-f]+(?:-[\da-f]+)*\.png$/i.test(entry.image || '')) return;
    const qualified = fromSequence(entry.unified);
    if (qualified) index.set(qualified, entry.image);
    const unqualified = fromSequence(entry.non_qualified);
    // Recognize emoji with or without optional selectors, while preserving
    // common copyright/trademark symbols when they are used as plain text.
    if (unqualified && !['©', '®', '™'].includes(unqualified)) index.set(unqualified, entry.image);
  };
  for (const entry of data) {
    add(entry);
    for (const variation of Object.values(entry.skin_variations || {})) add(variation);
  }
  return index;
}

export function renderEmojiText(value, images = new Map()) {
  const text = String(value ?? '');
  if (!images.size) return escapeHtml(text);
  return [...segmenter.segment(text)].map(({ segment }) => {
    const source = images.get(segment);
    if (!/^data:image\/png;base64,[a-z\d+/=]+$/i.test(source || '')) return escapeHtml(segment);
    return `<img class="macos-emoji" src="${source}" alt="${escapeHtml(segment)}" draggable="false">`;
  }).join('');
}

let appleData;
const imageCache = new Map();
async function loadAppleData() {
  if (!appleData) appleData = (async () => {
    const file = require.resolve('emoji-datasource-apple/emoji.json');
    return { index: buildAppleEmojiIndex(JSON.parse(await readFile(file, 'utf8'))), directory: path.join(path.dirname(file), 'img', 'apple', '64') };
  })();
  return appleData;
}

export async function loadAppleEmojiImages(values) {
  const { index, directory } = await loadAppleData();
  const characters = new Set(values.flatMap(value => [...segmenter.segment(String(value ?? '').slice(0, 3000))].map(part => part.segment)).filter(character => index.has(character)));
  const entries = await Promise.all([...characters].map(async character => {
    const filename = index.get(character);
    if (!imageCache.has(filename)) imageCache.set(filename, (async () => {
      const bytes = await readFile(path.join(directory, filename));
      if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid Apple emoji PNG: ${filename}`);
      return `data:image/png;base64,${bytes.toString('base64')}`;
    })());
    return [character, await imageCache.get(filename)];
  }));
  return new Map(entries);
}
