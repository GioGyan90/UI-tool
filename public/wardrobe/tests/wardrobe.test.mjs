import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createState, normalizeState } from '../avatar-sdk.js';
import { makeZip } from '../zip.js';
const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
test('exported built-in configuration round-trips all five complete outfits', () => {
  for (const preset of manifest.presets) {
    const original = createState(manifest, preset.id);
    assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(original)), manifest), original);
  }
});
test('untrusted config cannot substitute cross-category assets, remote URLs, or unbounded transforms', () => {
  const input = createState(manifest);
  input.layers.hair = { id: 'pants-denim', tint: 'url(https://example.com)', x: Infinity, y: 500, scale: -1, opacity: 7 };
  input.customAssets = { 'not-a-user-id': { kind: 'hair' }, 'user-good-id': { kind: 'hair', name: '新发型' }, 'user-bad-kind': { kind: 'remote' } };
  const safe = normalizeState(input, manifest);
  assert.equal(safe.layers.hair.id, 'hair-black'); assert.equal(safe.layers.hair.tint, null);
  assert.equal(safe.layers.hair.x, 0); assert.equal(safe.layers.hair.y, 150); assert.equal(safe.layers.hair.scale, .75); assert.equal(safe.layers.hair.opacity, 1);
  assert.deepEqual(Object.keys(safe.customAssets), ['user-good-id']);
  assert.throws(() => normalizeState({ version: 2 }, manifest), /不兼容/);
});
test('ZIP contains matching local/central metadata, UTF-8 names, sizes and CRC', async () => {
  const blob = await makeZip([{ name: '图层.png', data: new Blob(['hello']) }, { name: 'look.json', data: '{}' }]);
  const bytes = Buffer.from(await blob.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50); assert.equal(bytes.readUInt16LE(6), 0x800);
  assert.equal(bytes.readUInt32LE(14), 0x3610a686); assert.equal(bytes.readUInt32LE(18), 5);
  assert.equal(bytes.readUInt32LE(bytes.length - 22), 0x06054b50);
  assert.equal(bytes.readUInt16LE(bytes.length - 12), 2);
  const central = bytes.readUInt32LE(bytes.length - 6);
  assert.equal(bytes.readUInt32LE(central), 0x02014b50); assert.equal(bytes.readUInt32LE(central + 16), 0x3610a686);
  assert.equal(bytes.readUInt32LE(central + 42), 0);
});
