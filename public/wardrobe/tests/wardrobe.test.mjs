import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { COMPOSITE_ORDER, createState, normalizeState, createSavedPreset } from '../avatar-sdk.js';
import { makeZip } from '../zip.js';
const manifest = JSON.parse(await fs.readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
test('exported built-in configuration round-trips all five complete outfits', () => {
  for (const preset of manifest.presets) {
    const original = createState(manifest, preset.id);
    assert.deepEqual(normalizeState(JSON.parse(JSON.stringify(original)), manifest), original);
  }
});
test('legacy skin transforms migrate to independently editable head, neck and arms',()=>{
  const legacy=createState(manifest);delete legacy.layers.head;delete legacy.layers.neck;delete legacy.rigVersion;
  Object.assign(legacy.layers.body,{x:7,y:-4,scale:1.1,tint:'#cfa183',opacity:.8});
  const upgraded=normalizeState(legacy,manifest), old=manifest.anatomySource.box;
  assert.equal(upgraded.layers.neck.id,'neck-base');assert.equal(upgraded.layers.head.id,'head-base');
  for(const kind of ['body','head','neck']){
    const part=upgraded.layers[kind],box=manifest.slots[kind];
    assert.equal(part.tint,'#cfa183');assert.equal(part.opacity,.8);
    for(const axis of [0,1]){
      const center=box[axis]+box[axis+2]/2,oldCenter=old[axis]+old[axis+2]/2;
      const expected=oldCenter+(center-oldCenter)*1.1+(axis===0?7:-4);
      assert(Math.abs(center+part[axis===0?'x':'y']-expected)<1e-8);
    }
  }
});
test('rear collars, neck, front garments and head have an explicit physical order',()=>{
  for(const rear of ['top-collar-back','outer-collar-back'])assert(COMPOSITE_ORDER.indexOf(rear)<COMPOSITE_ORDER.indexOf('neck'));
  for(const rear of ['hair-back','outer-back'])assert(COMPOSITE_ORDER.indexOf(rear)<COMPOSITE_ORDER.indexOf('body'));
  for(const front of ['top','outer'])assert(COMPOSITE_ORDER.indexOf('neck')<COMPOSITE_ORDER.indexOf(front));
  assert(COMPOSITE_ORDER.indexOf('outer')<COMPOSITE_ORDER.indexOf('head'));
  for(const id of ['top-shirt','top-formal'])assert.equal(manifest.assets.find(a=>a.id===id).facing,'right-three-quarter');
});
test('older eight-layer looks gain the correct paired rear pieces without resetting manual alignment',()=>{
  const look=createState(manifest,'trench');look.presetId='custom';look.layers.hair.id='hair-blonde-long';look.layers.neck.y=-17.5;
  delete look.layers['hair-back'];delete look.layers['outer-back'];
  const updated=normalizeState(look,manifest);
  assert.equal(updated.layers['hair-back'].id,'hair-long-back');assert.equal(updated.layers['outer-back'].id,'outer-trench-lining');
  assert.equal(updated.layers.neck.y,-17.5);assert.equal(updated.layers['hair-back'].followParent,true);
  const independent=structuredClone(updated);Object.assign(independent.layers['hair-back'],{followParent:false,x:42.5,scaleX:1.12});
  assert.deepEqual(normalizeState(independent,manifest),independent);
});
test('untrusted config cannot substitute cross-category assets, remote URLs, or unbounded transforms', () => {
  const input = createState(manifest);
  input.layers.hair = { id: 'pants-denim', tint: 'url(https://example.com)', x: Infinity, y: 500, scale: -1, opacity: 7 };
  input.customAssets = { 'not-a-user-id': { kind: 'hair' }, 'user-good-id': { kind: 'hair', name: '新发型' }, 'user-bad-kind': { kind: 'remote' } };
  const safe = normalizeState(input, manifest);
  assert.equal(safe.layers.hair.id, 'hair-black'); assert.equal(safe.layers.hair.tint, null);
  assert.equal(safe.layers.hair.x, 0); assert.equal(safe.layers.hair.y, 400); assert.equal(safe.layers.hair.scale, .25); assert.equal(safe.layers.hair.opacity, 1);
  assert.deepEqual(Object.keys(safe.customAssets), ['user-good-id']);
  assert.throws(() => normalizeState({ version: 2 }, manifest), /不兼容/);
});
test('hair, head and neck fractional positions and independent dimensions survive config round-trip', () => {
  const state = createState(manifest);
  for (const kind of ['hair', 'head', 'neck']) Object.assign(state.layers[kind], { x: 23.4, y: -180.5, scale: .65, scaleX: 1.125, scaleY: .835 });
  const restored = normalizeState(JSON.parse(JSON.stringify(state)), manifest);
  for (const kind of ['hair', 'head', 'neck']) assert.deepEqual(restored.layers[kind], state.layers[kind]);
  delete state.layers.head.scaleX; delete state.layers.head.scaleY;
  assert.equal(normalizeState(state, manifest).layers.head.scaleX, 1);
  assert.equal(normalizeState(state, manifest).layers.head.scaleY, 1);
});
test('named presets are independent snapshots; updating one preserves its identity and other looks', () => {
  const live = createState(manifest, 'field');
  Object.assign(live.layers.hair, { x: 6.5, y: -3.2, scaleX: .9, scaleY: 1.08 });
  Object.assign(live.layers.head, { x: 8.1, y: 4.4, scale: .94 });
  Object.assign(live.layers.neck, { y: -12.5, scaleX: .83, scaleY: .76 });
  const first = createSavedPreset(live, '头颈校准 A', manifest);
  const firstCopy = JSON.stringify(first);
  live.layers.neck.y = -25.5;
  const second = createSavedPreset(live, '头颈校准 B', manifest);
  assert.notEqual(first.id, second.id); assert.equal(JSON.stringify(first), firstCopy);
  const loaded = normalizeState(JSON.parse(firstCopy).state, manifest);
  assert.equal(loaded.layers.neck.y, -12.5); assert.equal(loaded.layers.hair.scaleX, .9);
  assert.equal(loaded.savedPresetId, first.id); assert.equal(loaded.lookName, '头颈校准 A');
  const updated = createSavedPreset(live, '头颈校准 A 修订', manifest, first);
  assert.equal(updated.id, first.id); assert.equal(updated.createdAt, first.createdAt);
  assert.equal(updated.state.layers.neck.y, -25.5); assert.equal(second.name, '头颈校准 B');
  assert.throws(() => createSavedPreset(live, '  ', manifest), /名称/);
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
