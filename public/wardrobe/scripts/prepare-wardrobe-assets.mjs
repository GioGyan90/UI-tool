/** Mechanical alpha cleanup, sprite slicing and registration; all illustration is image-generated.
 * Usage: NODE_PATH=<directory containing sharp> node public/wardrobe/scripts/prepare-wardrobe-assets.mjs source-map.json
 * The source map contains generated PNG paths keyed by the asset IDs below.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sharp = require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES ? path.join(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES, 'sharp') : 'sharp');
const sourceMap = JSON.parse(await fs.readFile(process.argv[2], 'utf8'));
const root = new URL('../', import.meta.url);
await fs.mkdir(new URL('assets/', root), { recursive: true });
const width = 948, height = 1659;
const assets = [];
const rawCache = new Map();
async function raw(id) {
  if (!rawCache.has(id)) rawCache.set(id, (async () => {
    const { data, info } = await sharp(sourceMap[id]).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    // Transparent image generators may retain RGB in zero-alpha pixels. Clear that data.
    for (let i = 0; i < data.length; i += 4) if (data[i + 3] < 64) data.fill(0, i, i + 4);
    return { data, info };
  })());
  return rawCache.get(id);
}
function bbox(data, w, h, region = [0, 0, w, h]) {
  const [rx, ry, rw, rh] = region; let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = ry; y < Math.min(h, ry + rh); y++) for (let x = rx; x < Math.min(w, rx + rw); x++) if (data[(y * w + x) * 4 + 3] >= 64) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  if (x1 < x0) throw new Error('Empty source sprite');
  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}
async function crop(id, region) {
  const { data, info } = await raw(id);
  const rect = bbox(data, info.width, info.height, region);
  const buffer = await sharp(data, { raw: info }).extract(rect).png().toBuffer();
  return { buffer, rect };
}
async function register(id, kind, name, box, options = {}) {
  const { buffer, rect } = await crop(id);
  let result;
  if (options.split) {
    const [sourceY, targetY] = options.split;
    const split = sourceY - rect.top, firstHeight = targetY - box[1];
    const pieces = await Promise.all([
      sharp(buffer).extract({ left: 0, top: 0, width: rect.width, height: split }).resize(box[2], firstHeight, { fit: 'fill' }).png().toBuffer(),
      sharp(buffer).extract({ left: 0, top: split, width: rect.width, height: rect.height - split }).resize(box[2], box[3] - firstHeight, { fit: 'fill' }).png().toBuffer(),
    ]);
    result = await sharp({ create: { width: box[2], height: box[3], channels: 4, background: '#00000000' } }).composite([{ input: pieces[0], top: 0, left: 0 }, { input: pieces[1], top: firstHeight, left: 0 }]).png().toBuffer();
  } else result = await sharp(buffer).resize(box[2], box[3], { fit: 'fill' }).png().toBuffer();
  if (options.fillSkinHoles) {
    const w = box[2], h = box[3], count = w * h;
    const pixels = await sharp(result).ensureAlpha().raw().toBuffer();
    const visited = new Uint8Array(count), queue = new Int32Array(count);
    function flood(start) {
      let tail = 1; queue[0] = start; visited[start] = 1;
      for (let head = 0; head < tail; head++) {
        const p = queue[head], x = p % w, y = Math.floor(p / w);
        for (const n of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (n >= 0 && !visited[n] && pixels[n * 4 + 3] < 128) { visited[n] = 1; queue[tail++] = n; }
      }
      return tail;
    }
    for (let p = 0; p < count; p++) if ((p < w || p >= count - w || p % w === 0 || p % w === w - 1) && !visited[p] && pixels[p * 4 + 3] < 128) flood(p);
    for (let p = 0; p < count; p++) if (!visited[p] && pixels[p * 4 + 3] < 128) {
      const area = flood(p);
      // Skin visible through the intentionally generated distressing, not the room behind it.
      if (area > 35 && area < 1800) for (let i = 0; i < area; i++) { const q = queue[i] * 4; pixels.set([221, 169, 139, 255], q); }
    }
    result = await sharp(pixels, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
  }
  await fs.writeFile(new URL(`assets/${id}.png`, root), result);
  assets.push({ id, kind, name, file: `./assets/${id}.png`, box, ...(options.sleeve ? { sleeve: options.sleeve } : {}) });
}
async function assembled(id, kind, name, pieces) {
  const composites = [];
  for (const part of pieces) {
    const { buffer } = await crop(id, part.region);
    composites.push({ input: await sharp(buffer).resize(part.box[2], part.box[3], { fit: 'fill' }).png().toBuffer(), left: part.box[0], top: part.box[1] });
  }
  const full = await sharp({ create: { width, height, channels: 4, background: '#00000000' } }).composite(composites).raw().toBuffer();
  const bounds = bbox(full, width, height);
  await sharp(full, { raw: { width, height, channels: 4 } }).extract(bounds).png().toFile(new URL(`assets/${id}.png`, root).pathname);
  assets.push({ id, kind, name, file: `./assets/${id}.png`, box: [bounds.left, bounds.top, bounds.width, bounds.height] });
}
await assembled('skin', 'body', '统一身体与面部', [
  { region: [380, 80, 270, 405], box: [400, 93, 160, 252] },
  { region: [180, 485, 230, 760], box: [256, 509, 115, 443] },
  { region: [620, 485, 230, 760], box: [594, 500, 114, 452] },
]);
await register('hair-black', 'hair', '随性中分', [373, 53, 219, 228]);
await register('hair-blonde', 'hair', '鎏金微卷', [369, 49, 229, 239]);
await register('top-tee', 'top', '纯棉圆领 T 恤', [281, 290, 426, 414], { sleeve: 'short' });
await register('top-shirt', 'top', '休闲白衬衫', [256, 286, 452, 579], { sleeve: 'long', split: [1175, 706] });
await register('top-turtleneck', 'top', '酒红高领针织', [256, 268, 452, 596], { sleeve: 'long', split: [1154, 712] });
await register('top-formal', 'top', '礼服衬衫与马甲', [256, 284, 452, 581], { sleeve: 'long', split: [1165, 714] });
await register('outer-bomber', 'outer', '墨色飞行夹克', [251, 278, 469, 583]);
await register('outer-field', 'outer', '橄榄绿工装夹克', [251, 278, 469, 586]);
await register('outer-trench', 'outer', '驼色长风衣', [249, 274, 475, 920]);
await register('outer-blazer', 'outer', '紫藤色礼服西装', [251, 277, 469, 608]);
assets.push({ id: 'none', kind: 'outer', name: '不穿外套', box: [251, 278, 469, 586] });
await register('pants-charcoal', 'pants', '炭灰修身西裤', [328, 684, 338, 808]);
await register('pants-denim', 'pants', '黑色破洞牛仔裤', [327, 684, 339, 808], { fillSkinHoles: true });
await register('pants-chino', 'pants', '橄榄棕休闲裤', [328, 684, 338, 808]);
for (const [id, name] of [['shoes-derby', '经典系带皮鞋'], ['shoes-sneakers', '黑白帆布鞋']]) {
  const { info } = await raw(id), split = Math.floor(info.width * .61);
  await assembled(id, 'shoes', name, [
    { region: [0, 0, split, info.height], box: [270, 1448, 201, 121] },
    { region: [split, 0, info.width - split, info.height], box: [580, 1473, 123, 140] },
  ]);
}
await sharp(sourceMap.room).resize({ width: 1440, withoutEnlargement: true }).jpeg({ quality: 86, mozjpeg: true }).toFile(new URL('assets/room.jpg', root).pathname);
const manifest = {
  version: '2026-11-02.1', width, height,
  characterBounds: [246, 45, 482, 1574],
  slots: { hair: [365, 45, 240, 250], body: [250, 90, 465, 865], top: [251, 268, 469, 600], outer: [249, 274, 475, 920], pants: [327, 684, 340, 808], shoes: [270, 1448, 433, 165] },
  bodyLongSleeveClips: [[380, 70, 210, 295], [245, 836, 125, 125], [587, 835, 125, 130]],
  assets,
  presets: [
    { id: 'casual', number: '01', name: '日常轻装', english: 'EVERYDAY EASE', layers: { hair: { id: 'hair-black' }, top: { id: 'top-tee', tint: '#625e59' }, outer: { id: 'none' }, pants: { id: 'pants-denim' }, shoes: { id: 'shoes-sneakers' } } },
    { id: 'night', number: '02', name: '夜行夹克', english: 'THE NIGHT WALK', layers: { hair: { id: 'hair-black' }, top: { id: 'top-tee', tint: '#77767d' }, outer: { id: 'outer-bomber' }, pants: { id: 'pants-charcoal' }, shoes: { id: 'shoes-derby' } } },
    { id: 'field', number: '03', name: '远行工装', english: 'OFF THE BEATEN PATH', layers: { hair: { id: 'hair-black' }, top: { id: 'top-shirt' }, outer: { id: 'outer-field' }, pants: { id: 'pants-chino' }, shoes: { id: 'shoes-derby', tint: '#70472f' } } },
    { id: 'trench', number: '04', name: '暖金风衣', english: 'GOLDEN AFTERNOON', layers: { hair: { id: 'hair-blonde' }, top: { id: 'top-turtleneck' }, outer: { id: 'outer-trench' }, pants: { id: 'pants-chino', tint: '#68513d' }, shoes: { id: 'shoes-derby', tint: '#75472d' } } },
    { id: 'formal', number: '05', name: '紫藤礼服', english: 'THE GRAND ENTRANCE', layers: { hair: { id: 'hair-blonde' }, top: { id: 'top-formal' }, outer: { id: 'outer-blazer' }, pants: { id: 'pants-charcoal', tint: '#b8a0d2' }, shoes: { id: 'shoes-derby', tint: '#4b3d63' } } },
  ],
};
await fs.writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${assets.filter(a => a.file).length} real PNG layers + room; ${manifest.presets.length} presets.`);
const { buildAnatomy } = await import('./build-wardrobe-anatomy.mjs');
await buildAnatomy({root,neckSource:sourceMap.neck});
