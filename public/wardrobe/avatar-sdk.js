/** Lucky Break layered avatar SDK. No framework or remote service required. */
export const CATEGORIES = ['hair', 'top', 'outer', 'pants', 'shoes', 'hair-back', 'outer-back'];
export const BACK_PARENTS = {'hair-back':'hair', 'outer-back':'outer'};
export const CALIBRATION_KINDS = ['hair', 'head', 'neck', 'hair-back', 'outer-back'];
export const DRAW_ORDER = ['hair-back', 'outer-back', 'shoes', 'pants', 'body', 'neck', 'top', 'outer', 'head', 'hair'];
export const COMPOSITE_ORDER = ['hair-back', 'outer-back', 'shoes', 'pants', 'body', 'top-collar-back', 'outer-collar-back', 'neck', 'top', 'outer', 'head', 'hair'];
const LAYER_KINDS = ['body', 'head', 'neck', ...CATEGORIES];
export const STATE_KEY = 'luckybreak.wardrobe.v1';
const DB_NAME = 'luckybreak-wardrobe';
const CHANNEL_NAME = 'luckybreak-avatar';
const imageCache = new Map();
const layerCache = new Map();
const collarCache = new Map();
let dbPromise;
let manifestPromise;
let channel;
const number = (v, fallback, min, max) => Number.isFinite(Number(v)) ? Math.min(max, Math.max(min, Number(v))) : fallback;
const copy = value => JSON.parse(JSON.stringify(value));

export async function getManifest() {
  manifestPromise ||= fetch(new URL('./manifest.json?v=20261102-backlayers1', import.meta.url)).then(response => {
    if (!response.ok) throw new Error('素材清单读取失败，请刷新重试。');
    return response.json();
  }).catch(error => { manifestPromise = undefined; throw error; });
  return manifestPromise;
}

export function createState(manifest, presetId = 'night') {
  const preset = manifest.presets.find(item => item.id === presetId) || manifest.presets[0];
  const state = { version: 1, rigVersion: 4, presetId: preset.id, savedPresetId: null, lookName: null, modifiedAt: new Date().toISOString(), layers: {}, customAssets: {} };
  for (const kind of LAYER_KINDS) {
    const parent = BACK_PARENTS[kind];
    const paired = parent && manifest.assets.find(a => a.id === state.layers[parent]?.id)?.backAsset;
    const selection = preset.layers[kind] || { id: paired || manifest.defaults?.[kind] || (kind === 'body' ? 'skin' : undefined) };
    state.layers[kind] = { id: selection.id, tint: selection.tint || null, x: 0, y: 0, scale: 1, scaleX: 1, scaleY: 1, opacity: 1, visible: true, fit: 'part', followParent: !!parent };
  }
  return state;
}

export function normalizeState(input, manifest) {
  if (!input || input.version !== 1 || !input.layers || typeof input.layers !== 'object') throw new Error('配置格式不兼容，需要版本 1 的人物造型配置。');
  const state = createState(manifest, input.presetId);
  state.presetId = manifest.presets.some(p => p.id === input.presetId) ? input.presetId : 'custom';
  state.savedPresetId = /^look-[\w-]{1,80}$/.test(input.savedPresetId || '') ? input.savedPresetId : null;
  state.lookName = typeof input.lookName === 'string' ? input.lookName.trim().slice(0, 40) || null : null;
  state.modifiedAt = typeof input.modifiedAt === 'string' && !Number.isNaN(Date.parse(input.modifiedAt)) ? input.modifiedAt : new Date().toISOString();
  const custom = input.customAssets && typeof input.customAssets === 'object' ? input.customAssets : {};
  for (const [id, asset] of Object.entries(custom).slice(0, 40)) {
    if (!/^user-[\w-]{1,80}$/.test(id) || !asset || !CATEGORIES.includes(asset.kind)) continue;
    state.customAssets[id] = { id, kind: asset.kind, name: String(asset.name || '自定义素材').slice(0, 50) };
  }
  const legacy = !input.layers.head && !input.layers.neck && input.layers.body;
  for (const kind of LAYER_KINDS) {
    let layer = input.layers[kind] || {};
    if (legacy && ['body','head','neck'].includes(kind)) {
      const oldBox = manifest.anatomySource?.box || [256,93,452,859];
      const nextBox = manifest.slots[kind];
      const scale = number(legacy.scale,1,.75,1.25);
      layer = { ...legacy, id: kind === 'body' ? 'skin' : state.layers[kind].id,
        x: number(legacy.x,0,-150,150) + (nextBox[0]+nextBox[2]/2-oldBox[0]-oldBox[2]/2)*(scale-1),
        y: number(legacy.y,0,-150,150) + (nextBox[1]+nextBox[3]/2-oldBox[1]-oldBox[3]/2)*(scale-1) };
    }
    const validBuiltin = manifest.assets.some(asset => asset.id === layer.id && asset.kind === kind);
    const validCustom = state.customAssets[layer.id]?.kind === kind;
    const id = validBuiltin || validCustom ? layer.id : state.layers[kind].id;
    const calibration = CALIBRATION_KINDS.includes(kind);
    state.layers[kind] = {
      id,
      tint: /^#[\da-f]{6}$/i.test(layer.tint || '') ? layer.tint.toLowerCase() : null,
      x: number(layer.x, 0, calibration ? -400 : -150, calibration ? 400 : 150),
      y: number(layer.y, 0, calibration ? -400 : -150, calibration ? 400 : 150),
      scale: number(layer.scale, 1, calibration ? .25 : .75, calibration ? 2.5 : 1.25),
      scaleX: calibration ? number(layer.scaleX, 1, .5, 2) : 1,
      scaleY: calibration ? number(layer.scaleY, 1, .5, 2) : 1,
      opacity: number(layer.opacity, 1, 0, 1),
      followParent: !!BACK_PARENTS[kind] && layer.followParent !== false,
      visible: layer.visible !== false, fit: layer.fit === 'canvas' ? 'canvas' : 'part',
    };
  }
  for (const [kind, parent] of Object.entries(BACK_PARENTS)) if (!input.layers[kind]) {
    state.layers[kind].id = manifest.assets.find(a => a.id === state.layers[parent].id)?.backAsset || manifest.defaults[kind];
  }
  return state;
}

function database() {
  dbPromise ||= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('assets');
      db.createObjectStore('state');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('浏览器存储不可用，请允许本站使用本地存储。'));
    request.onblocked = () => reject(new Error('存储更新被其他页面阻止，请关闭旧页面后重试。'));
  }).catch(error => { dbPromise = undefined; throw error; });
  return dbPromise;
}

async function dbGet(storeName, key) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, key, value) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    transaction.objectStore(storeName).put(value, key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(new Error('保存失败，浏览器存储空间可能不足。请导出配置备份。'));
    transaction.onabort = () => reject(new Error('保存未完成，请重试或导出配置备份。'));
  });
}

export async function loadState(manifest) {
  manifest ||= await getManifest();
  let value;
  try { value = await dbGet('state', 'current'); } catch { /* Built-in presets still work without persistence. */ }
  try {
    const backup = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
    if (backup && (!value || Date.parse(backup.modifiedAt) >= Date.parse(value.modifiedAt))) value = backup;
  } catch { /* Corrupt/blocked storage. */ }
  if (value) {
    try { return normalizeState(value, manifest); } catch { /* Use the built-in look for an obsolete state. */ }
  }
  return createState(manifest);
}

function broadcast(value) {
  window.dispatchEvent(new CustomEvent('luckybreak:avatar-change', { detail: copy(value) }));
  if ('BroadcastChannel' in window) {
    channel ||= new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'avatar-change', modifiedAt: value.modifiedAt });
  }
}

export async function saveState(state, manifest) {
  manifest ||= await getManifest();
  const value = normalizeState(state, manifest);
  await dbPut('state', 'current', value);
  try { localStorage.setItem(STATE_KEY, JSON.stringify(value)); } catch { /* IndexedDB is the durable source. */ }
  broadcast(value);
  return value;
}

/** A named preset is a snapshot, separate from the automatically saved current look. */
export function createSavedPreset(state, name, manifest, previous = null) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new Error('请先输入预设名称。');
  const id = previous?.id || `look-${crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')}`;
  if (!/^look-[\w-]{1,80}$/.test(id)) throw new Error('预设编号无效。');
  const now = new Date().toISOString();
  const snapshot = normalizeState(state, manifest);
  snapshot.presetId = 'custom'; snapshot.savedPresetId = id; snapshot.lookName = name;
  return { format: 'luckybreak-saved-look', id, name, createdAt: previous?.createdAt || now, updatedAt: now, state: snapshot };
}

export async function listSavedPresets(manifest) {
  manifest ||= await getManifest();
  const db = await database();
  const records = await new Promise((resolve, reject) => {
    const request = db.transaction('state', 'readonly').objectStore('state').getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return records.filter(record => record?.format === 'luckybreak-saved-look' && /^look-[\w-]{1,80}$/.test(record.id || '')).flatMap(record => {
    try { return [{ ...record, name: String(record.name || '未命名预设').slice(0, 40), state: normalizeState(record.state, manifest) }]; }
    catch { return []; }
  }).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function savePreset(state, name, { id = null, manifest } = {}) {
  manifest ||= await getManifest();
  const snapshot = normalizeState(state, manifest);
  if (id && !/^look-[\w-]{1,80}$/.test(id)) throw new Error('预设编号无效。');
  const previous = id ? await dbGet('state', `preset:${id}`) : null;
  if (id && previous?.format !== 'luckybreak-saved-look') throw new Error('找不到所选预设，请重新选择。');
  const record = createSavedPreset(snapshot, name, manifest, previous);
  // Each preset has its own IndexedDB key, so saving another preset cannot replace it.
  await dbPut('state', `preset:${record.id}`, record);
  return record;
}

/** Same-origin pages/tabs receive the current saved composition. Returns unsubscribe. */
export function subscribeAvatar(callback) {
  let active = true;
  let lastStamp = '';
  const receive = async () => {
    try {
      const state = await loadState();
      const stamp = JSON.stringify(state);
      if (!active || stamp === lastStamp) return;
      lastStamp = stamp;
      await callback(state);
    } catch (error) { console.error('Avatar update failed:', error); }
  };
  const storageListener = event => { if (event.key === STATE_KEY) void receive(); };
  window.addEventListener('storage', storageListener);
  window.addEventListener('luckybreak:avatar-change', receive);
  const receiver = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  if (receiver) receiver.onmessage = event => { if (event.data?.type === 'avatar-change') void receive(); };
  return () => {
    active = false;
    window.removeEventListener('storage', storageListener);
    window.removeEventListener('luckybreak:avatar-change', receive);
    receiver?.close();
  };
}

export function selectedAsset(manifest, state, kind) {
  const id = state.layers[kind]?.id;
  return manifest.assets.find(asset => asset.id === id && asset.kind === kind) || state.customAssets[id] || null;
}

async function loadImage(asset, version = '') {
  if (asset.id === 'none' || asset.empty) return null;
  const cacheKey=asset.id.startsWith('user-')?asset.id:`${asset.id}@${version}`;
  if (!imageCache.has(cacheKey)) {
    imageCache.set(cacheKey, (async () => {
      let objectUrl;
      let source;
      if (asset.id.startsWith('user-')) {
        const blob = await dbGet('assets', asset.id);
        if (!blob) throw new Error('找不到自定义素材，请重新导入对应 PNG。');
        objectUrl = URL.createObjectURL(blob);
        source = objectUrl;
      } else {
        const url=new URL(asset.file, import.meta.url);if(version)url.searchParams.set('v',version);source=url.href;
      }
      try {
        const image = new Image();
        image.decoding = 'async';
        image.src = source;
        await image.decode();
        return image;
      } catch { throw new Error(`素材「${asset.name}」加载失败，请检查网络后重试。`); }
      finally { if (objectUrl) URL.revokeObjectURL(objectUrl); }
    })().catch(error => { imageCache.delete(cacheKey); throw error; }));
  }
  return imageCache.get(cacheKey);
}

export async function preloadAssets(manifest, ids) {
  await Promise.all(manifest.assets.filter(asset => ids.includes(asset.id)).map(asset=>loadImage(asset,manifest.version)));
}

export function makeCanvas(manifest) {
  const canvas = document.createElement('canvas');
  canvas.width = manifest.width;
  canvas.height = manifest.height;
  return canvas;
}

function tintCanvas(canvas, color) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
  const histogram = new Uint32Array(256); let samples = 0;
  for (let i = 0; i < image.data.length; i += 4) if (image.data[i + 3] > 200) {
    histogram[Math.round(.2126 * image.data[i] + .7152 * image.data[i + 1] + .0722 * image.data[i + 2])]++; samples++;
  }
  let reference = 0, cumulative = 0;
  for (; reference < 255; reference++) { cumulative += histogram[reference]; if (cumulative >= samples * .62) break; }
  reference = Math.max(32, reference);
  // Normalize the cloth's midtone so black fabric can also become a pale color.
  for (let i = 0; i < image.data.length; i += 4) {
    if (!image.data[i + 3]) continue;
    const luminance = .2126 * image.data[i] + .7152 * image.data[i + 1] + .0722 * image.data[i + 2];
    const factor = Math.min(1.22, luminance / reference);
    const highlight = Math.max(0, luminance / reference - 1.25) * 12;
    for (let c = 0; c < 3; c++) image.data[i + c] = Math.min(255, rgb[c] * factor + highlight);
  }
  context.putImageData(image, 0, 0);
}

/** Every returned layer is a real transparent canvas in the common coordinate system. */
export async function renderLayer(kind, state, manifest) {
  manifest ||= await getManifest();
  const layer = state.layers[kind];
  const asset = selectedAsset(manifest, state, kind);
  if (!layer || !asset || !layer.visible || layer.opacity === 0 || asset.id === 'none' || asset.empty) return makeCanvas(manifest);
  const parentKind = BACK_PARENTS[kind], parent = parentKind && layer.followParent ? state.layers[parentKind] : null;
  const parentAsset = parent && selectedAsset(manifest, state, parentKind);
  if (parent && (!parentAsset || !parent.visible || parent.opacity === 0 || parentAsset.id === 'none' || parentAsset.empty)) return makeCanvas(manifest);
  const outer = selectedAsset(manifest, state, 'outer');
  const top = selectedAsset(manifest, state, 'top');
  const longSleeve = (state.layers.outer.visible && state.layers.outer.opacity > 0 && outer && outer.id !== 'none') || (state.layers.top.visible && state.layers.top.opacity > 0 && top?.sleeve === 'long');
  const key = JSON.stringify([manifest.version, kind, layer, parent, kind === 'body' && longSleeve, kind === 'top' ? state.layers.outer : null]);
  if (layerCache.has(key)) return layerCache.get(key);
  const canvas = makeCanvas(manifest);
  const image = await loadImage(asset,manifest.version);
  if (!image) return canvas;
  const context = canvas.getContext('2d');
  let box = asset.box || manifest.slots[kind];
  if (asset.id.startsWith('user-')) {
    if (layer.fit === 'canvas') box = [0, 0, manifest.width, manifest.height];
    else {
      const slot = manifest.slots[kind];
      const ratio = Math.min(slot[2] / image.width, slot[3] / image.height);
      box = [slot[0] + (slot[2] - image.width * ratio) / 2, slot[1] + (slot[3] - image.height * ratio) / 2, image.width * ratio, image.height * ratio];
    }
  }
  const [x, y, width, height] = box;
  if (parent) {
    const pbox = parentAsset.id.startsWith('user-') && parent.fit === 'canvas' ? [0,0,manifest.width,manifest.height] : parentAsset.box || manifest.slots[parentKind];
    const px=pbox[0]+pbox[2]/2, py=pbox[1]+pbox[3]/2;
    context.translate(px+parent.x,py+parent.y);
    context.scale(parent.scale*(parent.scaleX??1)*(parentAsset.mirrorX?-1:1),parent.scale*(parent.scaleY??1));
    context.translate(-px,-py);
  }
  context.translate(x + width / 2 + layer.x, y + height / 2 + layer.y);
  context.scale(layer.scale * (layer.scaleX ?? 1) * (asset.mirrorX ? -1 : 1), layer.scale * (layer.scaleY ?? 1));
  if (kind === 'body' && longSleeve) {
    context.beginPath();
    for (const [cx,cy,cw,ch] of manifest.bodyLongSleeveClips) context.rect(cx-x-width/2,cy-y-height/2,cw,ch);
    context.clip();
  }
  context.drawImage(image, -width / 2, -height / 2, width, height);
  context.resetTransform();
  const color=layer.tint || parent?.tint;
  if (color) tintCanvas(canvas, color);
  if (parent && asset.clipToParent) {
    const front=await renderLayer(parentKind,state,manifest),fp=front.getContext('2d').getImageData(0,0,canvas.width,canvas.height);
    const mask=makeCanvas(manifest),mc=mask.getContext('2d');
    mc.fillStyle='#fff';
    for(let y=0;y<canvas.height;y++){
      let left=canvas.width,right=-1;
      for(let x=0;x<canvas.width;x++)if(fp.data[(y*canvas.width+x)*4+3]>0){left=Math.min(left,x);right=x;}
      if(right>=left)mc.fillRect(left,y,right-left+1,1);
    }
    context.globalCompositeOperation='destination-in';context.drawImage(mask,0,0);context.globalCompositeOperation='source-over';
  }
  if (kind === 'top' && state.layers.outer.visible && state.layers.outer.opacity > 0 && outer?.id !== 'none') {
    // Fit an inner garment inside the outer silhouette while preserving its open front.
    const jacket = await renderLayer('outer', state, manifest);
    const pixels = jacket.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
    const mask = makeCanvas(manifest), maskContext = mask.getContext('2d');
    const middle = Math.round(480 + state.layers.outer.x);
    const maskPixels = maskContext.createImageData(canvas.width, canvas.height);
    let first = canvas.height, last = 0;
    for (let y = 0; y < canvas.height; y++) {
      let hasPixel = false;
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels.data[i + 3] > 45) { maskPixels.data[i + 3] = 255; hasPixel = true; }
      }
      if (!hasPixel) continue;
      first = Math.min(first, y); last = y;
      let best = null, distance = 150;
      const alpha = px => maskPixels.data[(y * canvas.width + px) * 4 + 3];
      for (let x = 1; x < canvas.width - 1; x++) {
        if (alpha(x) || !alpha(x - 1)) continue;
        const start = x;
        while (x < canvas.width && !alpha(x)) x++;
        if (x < canvas.width && x - start > 6) {
          const d = Math.abs((start + x) / 2 - middle);
          if (d < distance) { distance = d; best = [start, x]; }
        }
      }
      if (best) for (let x = best[0]; x <= best[1]; x++) maskPixels.data[(y * canvas.width + x) * 4 + 3] = 255;
    }
    for (let y = 0; y < canvas.height; y++) if (y < first || y > last) for (let x = 0; x < canvas.width; x++) maskPixels.data[(y * canvas.width + x) * 4 + 3] = 255;
    maskContext.putImageData(maskPixels, 0, 0);
    context.globalCompositeOperation = 'destination-in'; context.drawImage(mask, 0, 0); context.globalCompositeOperation = 'source-over';
  }
  const opacity=layer.opacity*(parent?.opacity??1);
  if (opacity < 1) {
    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = `rgba(0,0,0,${opacity})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = 'source-over';
  }
  layerCache.set(key, canvas);
  if (layerCache.size > 12) layerCache.delete(layerCache.keys().next().value);
  return canvas;
}

async function splitCollar(full, kind, state, manifest) {
  const asset=selectedAsset(manifest,state,kind), layer=state.layers[kind];
  const key=JSON.stringify([manifest.version,kind,layer,kind==='top'?state.layers.outer:null]);
  if(collarCache.has(key))return collarCache.get(key);
  const back=makeCanvas(manifest), front=makeCanvas(manifest);
  const fc=front.getContext('2d');fc.drawImage(full,0,0);
  if(!asset?.rearCollar || !layer.visible || asset.id==='none') return {back,front};
  const mask=makeCanvas(manifest), mc=mask.getContext('2d');
  const image=await loadImage({id:asset.id+'-rear-mask',name:asset.name+'后领',file:asset.rearCollar.file},manifest.version);
  const [x,y,w,h]=asset.box;
  mc.translate(x+w/2+layer.x,y+h/2+layer.y);
  mc.scale(layer.scale*(asset.mirrorX?-1:1),layer.scale);
  mc.drawImage(image,-w/2,-h/2,w,h);mc.resetTransform();
  // Preserve antialiasing and the original alpha when front/back recombine:
  // A = Af + Ab*(1-Af), hence Ab=(A-Af)/(1-Af).
  const pixels=mc.getImageData(0,0,mask.width,mask.height), original=full.getContext('2d').getImageData(0,0,mask.width,mask.height);
  const frontPixels=fc.createImageData(mask.width,mask.height),bc=back.getContext('2d'),backPixels=bc.createImageData(mask.width,mask.height);
  for(let i=0;i<original.data.length;i+=4){
    const a=original.data[i+3]/255,m=pixels.data[i+3]/255,fa=a*(1-m),ba=fa<1?(a-fa)/(1-fa):0;
    for(let c=0;c<3;c++)frontPixels.data[i+c]=backPixels.data[i+c]=original.data[i+c];
    frontPixels.data[i+3]=Math.round(fa*255);backPixels.data[i+3]=Math.round(ba*255);
  }
  fc.putImageData(frontPixels,0,0);bc.putImageData(backPixels,0,0);
  const result={back,front};collarCache.set(key,result);
  if(collarCache.size>4)collarCache.delete(collarCache.keys().next().value);
  return result;
}

/** Actual paint/export stack: rear collars, independent neck, front garments, head. */
export async function renderCompositeLayers(state, manifest) {
  manifest ||= await getManifest();
  if(DRAW_ORDER.some(kind=>!state.layers[kind])) state=normalizeState(state,manifest);
  const layers = await Promise.all(DRAW_ORDER.filter(kind=>!BACK_PARENTS[kind]).map(async kind => [kind, await renderLayer(kind, state, manifest)]));
  layers.push(...await Promise.all(Object.keys(BACK_PARENTS).map(async kind=>[kind,await renderLayer(kind,state,manifest)])));
  const canvases=Object.fromEntries(layers);
  for(const kind of ['top','outer']) {
    const {back,front}=await splitCollar(canvases[kind],kind,state,manifest);
    canvases[kind+'-collar-back']=back;canvases[kind]=front;
  }
  return COMPOSITE_ORDER.map(kind=>({kind,canvas:canvases[kind]}));
}

/** Compose offscreen first, so overlapping async renders never leave partial avatars. */
export async function renderAvatar(target, state, manifest) {
  manifest ||= await getManifest();
  const layers=await renderCompositeLayers(state,manifest);
  const result = makeCanvas(manifest);
  const context = result.getContext('2d');
  for (const {canvas} of layers) {
    context.drawImage(canvas, 0, 0);
  }
  if (target) {
    target.width = manifest.width;
    target.height = manifest.height;
    target.getContext('2d').drawImage(result, 0, 0);
  }
  return result;
}

export function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 导出失败，请重试。')), 'image/png'));
}

export async function getAvatarBlob(state, manifest) {
  manifest ||= await getManifest();
  return canvasBlob(await renderAvatar(null, state || await loadState(manifest), manifest));
}

export async function importAsset(file, kind) {
  if (!CATEGORIES.includes(kind)) throw new Error('此图层不能导入素材。');
  if (file.size > 10 * 1024 * 1024) throw new Error('PNG 不能超过 10 MB。');
  const signature = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (signature.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('请选择真实的 PNG 文件。');
  const image = await createImageBitmap(file);
  const sizeOK = image.width > 0 && image.height > 0 && image.width <= 4096 && image.height <= 4096;
  image.close();
  if (!sizeOK) throw new Error('PNG 的宽高不能超过 4096 像素。');
  const id = `user-${(crypto.randomUUID?.() || Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join(''))}`;
  await dbPut('assets', id, file);
  return { id, name: file.name.replace(/\.png$/i, '').slice(0, 50), kind };
}

async function blobDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportConfig(state) {
  const assets = {};
  for (const id of Object.keys(state.customAssets)) {
    const blob = await dbGet('assets', id);
    if (blob) assets[id] = await blobDataURL(blob);
  }
  return { format: 'luckybreak-wardrobe', state: copy(state), assets };
}

export async function importConfig(config, manifest) {
  manifest ||= await getManifest();
  if (config.format !== 'luckybreak-wardrobe') throw new Error('请选择人物造型室导出的配置 JSON。');
  const state = normalizeState(config.state, manifest);
  const pending = [];
  for (const [id, asset] of Object.entries(state.customAssets)) {
    const data = config.assets?.[id];
    if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 14 * 1024 * 1024) throw new Error(`配置中「${asset.name}」的 PNG 数据缺失或过大。`);
    const blob = await (await fetch(data)).blob();
    const image = await createImageBitmap(blob);
    const valid = image.width <= 4096 && image.height <= 4096;
    image.close();
    if (!valid) throw new Error('配置中的素材尺寸超过 4096 像素。');
    pending.push([id, blob]);
  }
  for (const [id, blob] of pending) { await dbPut('assets', id, blob); imageCache.delete(id); }
  layerCache.clear();
  collarCache.clear();
  return state;
}

/** Framework-free integration: import SDK, loadState, renderAvatar, subscribeAvatar. */
export const LuckyBreakAvatar = { getManifest, loadState, saveState, renderAvatar, renderLayer, renderCompositeLayers, getAvatarBlob, subscribeAvatar, createState, listSavedPresets, savePreset, exportConfig, importConfig };
if (typeof window !== 'undefined') window.LuckyBreakAvatar = LuckyBreakAvatar;
