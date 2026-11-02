import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { CATEGORIES, DRAW_ORDER, createState, normalizeState } from '../avatar-sdk.js';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', root), 'utf8'));
const seen = new Set();
let bytes = 0;
const files=new Set();
assert.equal(manifest.width, 948); assert.equal(manifest.height, 1659);
assert.equal(manifest.presets.length, 5);
for (const asset of manifest.assets) {
  assert(!seen.has(asset.id), `Duplicate asset ID: ${asset.id}`); seen.add(asset.id);
  assert(DRAW_ORDER.includes(asset.kind), `Unknown kind: ${asset.kind}`);
  assert.equal(asset.facing,'right-three-quarter',`Unverified facing: ${asset.id}`);
  if(asset.rearCollar){
    assert(asset.rearCollar.file.startsWith('./assets/'),`Invalid collar mask path: ${asset.id}`);
    const mask=await fs.readFile(new URL(asset.rearCollar.file,root));
    assert.equal(mask.readUInt32BE(16),asset.box[2]);assert.equal(mask.readUInt32BE(20),asset.box[3]);
  }
  assert.equal(asset.box.length, 4);
  const [x, y, w, h] = asset.box;
  assert([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= manifest.width && y + h <= manifest.height, `Bad registration: ${asset.id}`);
  if (asset.id === 'none'||asset.empty) continue;
  assert(asset.file.startsWith('./assets/') && asset.file.endsWith('.png') && !asset.file.includes('..'), `Unsafe asset path: ${asset.id}`);
  const data = await fs.readFile(new URL(asset.file, root)); if(!files.has(asset.file)){bytes+=data.length;files.add(asset.file);}
  assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Not PNG: ${asset.id}`);
  assert.equal(data.readUInt32BE(16), w, `Width mismatch: ${asset.id}`);
  assert.equal(data.readUInt32BE(20), h, `Height mismatch: ${asset.id}`);
  assert([4, 6].includes(data[25]), `No alpha channel: ${asset.id}`);
}
for (const preset of manifest.presets) {
  const state = createState(manifest, preset.id);
  assert.deepEqual(normalizeState(state, manifest), state);
  for (const kind of DRAW_ORDER) assert(manifest.assets.some(asset => asset.kind === kind && asset.id === state.layers[kind].id), `Missing ${kind} in ${preset.id}`);
}
for (const file of ['index.html', 'studio.css', 'studio.js', 'avatar-sdk.js', 'reader.html', 'reader.js', 'icons.js', 'zip.js', 'assets/room.jpg']) assert((await fs.stat(new URL(file, root))).size > 0, `Missing file: ${file}`);
console.log(`Wardrobe OK: ${files.size} transparent PNG files, ${DRAW_ORDER.length} editable layers, 5 valid looks, ${(bytes / 1024 / 1024).toFixed(2)} MB of layered artwork.`);
