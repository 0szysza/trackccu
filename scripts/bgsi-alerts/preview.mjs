import path from 'node:path';
import { collectSnapshot, GAME } from './core.mjs';
import { createRenderer } from './render.mjs';

const snapshot = await collectSnapshot();
if (!snapshot.updates) throw new Error('Cannot render the BGSI update preview without game details.');
const renderer = await createRenderer();
try {
  const output = path.join(process.env.BGSI_IMAGE_DIR || '_bgsi-alert-images', 'preview-updates.png');
  await renderer.render({ category: 'updates', item: snapshot.updates, game: GAME, detectedAt: snapshot.observedAt }, output, { preview: true });
  console.log('Generated BGSI update preview PNG.');
} finally {
  await renderer.close();
}
