import path from 'node:path';
import { collectSnapshot, GAME } from './core.mjs';
import { createRenderer } from './render.mjs';
const snapshot = await collectSnapshot();
if (Object.keys(snapshot.errors).length) throw new Error(`Cannot render complete BGSI previews: ${Object.keys(snapshot.errors).join(', ')}`);
const now = new Date().toISOString();
const newest = list => [...list].sort((a, b) => (Date.parse(b.created) || 0) - (Date.parse(a.created) || 0))[0];
const event = [...snapshot.events].filter(item => Date.parse(item.end) > Date.now()).sort((a, b) => Date.parse(b.start) - Date.parse(a.start))[0] || snapshot.events[0];
const directory = path.resolve(process.env.BGSI_IMAGE_DIR || '_bgsi-alert-images');
const renderer = await createRenderer();
try {
  for (const [category, item] of Object.entries({ updates: snapshot.updates, events: event, passes: newest(snapshot.passes), products: newest(snapshot.products) })) {
    if (!item) continue;
    const output = path.join(directory, `preview-${category}.png`);
    await renderer.render({ category, item, game: snapshot.updates || GAME, detectedAt: now }, output, { preview: true });
    console.log(`${category}: generated preview PNG`);
  }
} finally { await renderer.close(); }
