import { CATEGORIES, DRAW_ORDER, STATE_KEY, getManifest, createState, normalizeState, loadState, saveState, renderAvatar, renderLayer, selectedAsset, canvasBlob, getAvatarBlob, importAsset, exportConfig, importConfig } from './avatar-sdk.js';
import { makeZip } from './zip.js';
import { icon, iconize } from './icons.js';
const labels = { hair: '发型', top: '内搭', outer: '外套', pants: '裤装', shoes: '鞋履', body: '基础身体' };
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
let manifest, state, saveTimer, toastTimer;
let selectedKind = 'hair', view = 'room', zoom = 1, renderVersion = 0;
let saveQueue = Promise.resolve();
const swatches = [null, '#292c2d', '#78614d', '#d1b17d', '#6b775c', '#9582ac'];
function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3400); }
const safely = callback => async event => { try { await callback(event); } catch (error) { console.error(error); toast(error.message || '操作未完成，请重试。'); } };
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function fitDrawing(target, source, box, padding = 10) {
  const [x, y, width, height] = box;
  const context = target.getContext('2d'); context.clearRect(0, 0, target.width, target.height);
  const scale = Math.min((target.width - padding * 2) / width, (target.height - padding * 2) / height);
  context.drawImage(source, x, y, width, height, (target.width - width * scale) / 2, (target.height - height * scale) / 2, width * scale, height * scale);
}
async function assetThumb(asset, canvas) {
  const preview = createState(manifest); preview.customAssets = clone(state.customAssets);
  if (asset.kind === 'top' || asset.kind === 'body') preview.layers.outer.id = 'none';
  if (asset.kind === 'body') preview.layers.top.visible = false;
  preview.layers[asset.kind] = { id: asset.id, tint: null, x: 0, y: 0, scale: 1, opacity: 1, visible: true, fit: 'part' };
  const result = await renderLayer(asset.kind, preview, manifest);
  fitDrawing(canvas, result, asset.thumbBox || asset.box || manifest.slots[asset.kind], asset.kind === 'hair' ? 18 : 12);
}
function updateLookLabel() {
  const preset = manifest.presets.find(p => p.id === state.presetId);
  $('look-number').textContent = preset ? `LOOK ${preset.number}` : 'YOUR LOOK';
  $('current-look-kicker').textContent = preset ? `${preset.number} / ${preset.english}` : 'A LOOK THAT IS YOURS';
  $('current-look-name').textContent = preset?.name || '自由混搭';
  for (const node of $('preset-grid').children) node.setAttribute('aria-pressed', String(node.dataset.preset === state.presetId));
}
function renderCategories() {
  $('category-tabs').replaceChildren(...CATEGORIES.map(kind => {
    const button = element('button', 'category-tab'); button.type = 'button'; button.innerHTML = icon(kind); button.append(element('span', '', labels[kind]));
    button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(kind === selectedKind)); button.dataset.kind = kind;
    button.addEventListener('click', () => selectKind(kind)); return button;
  }));
}
function renderLibrary() {
  const assets = [...manifest.assets, ...Object.values(state.customAssets)].filter(asset => asset.kind === selectedKind);
  $('category-title').textContent = labels[selectedKind]; $('asset-count').textContent = `${assets.length} 件素材`;
  $('asset-grid').replaceChildren(...assets.map(asset => {
    const button = element('button', 'asset-card'); button.type = 'button'; button.setAttribute('aria-label', `选择${asset.name}`); button.setAttribute('aria-pressed', String(state.layers[selectedKind].id === asset.id)); button.dataset.asset = asset.id;
    const thumb = element('div', 'thumb');
    if (asset.id === 'none') { const empty = element('span', 'empty-asset'); empty.innerHTML = icon('close'); thumb.append(empty); }
    else { const canvas = document.createElement('canvas'); canvas.width = 220; canvas.height = 225; thumb.append(canvas); void assetThumb(asset, canvas).catch(error => { button.title = error.message; thumb.textContent = '素材加载失败'; }); }
    const tag = element('span', 'asset-tag', asset.id.startsWith('user-') ? 'YOUR PNG' : 'ORIGINAL'); const check = element('span', 'check'); check.innerHTML = icon('check');
    button.append(thumb, tag, check, element('span', 'card-text', asset.name));
    button.addEventListener('click', () => {
      if (state.layers[selectedKind].id === asset.id) return;
      state.layers[selectedKind] = { id: asset.id, tint: null, x: 0, y: 0, scale: 1, opacity: 1, visible: true, fit: 'part' };
      changed(); updateLibrarySelection(); renderInspector();
    }); return button;
  }));
  $('asset-upload').disabled = selectedKind === 'body'; $('asset-upload').parentElement.style.display = selectedKind === 'body' ? 'none' : 'flex';
}
function updateLibrarySelection() { for (const item of $('asset-grid').children) item.setAttribute('aria-pressed', String(item.dataset.asset === state.layers[selectedKind].id)); }
function selectKind(kind) { selectedKind = kind; for (const tab of $('category-tabs').children) tab.setAttribute('aria-selected', String(tab.dataset.kind === kind)); renderLibrary(); renderInspector(); if (view === 'layers') void renderExploded(); }
function renderInspector() {
  const layer = state.layers[selectedKind], asset = selectedAsset(manifest, state, selectedKind);
  $('piece-icon').innerHTML = icon(selectedKind); $('selected-category').textContent = labels[selectedKind]; $('selected-name').textContent = asset?.name || '无';
  $('part-scale').value = Math.round(layer.scale * 100); $('scale-value').textContent = `${Math.round(layer.scale * 100)}%`;
  $('part-x').value = layer.x; $('part-y').value = layer.y; $('part-opacity').value = Math.round(layer.opacity * 100); $('opacity-value').textContent = `${Math.round(layer.opacity * 100)}%`;
  $('color-label').textContent = layer.tint?.toUpperCase() || '原画配色'; $('custom-color').value = layer.tint || '#5b5d50'; $('asset-fit-row').hidden = !asset?.id.startsWith('user-'); $('asset-fit').value = layer.fit;
  for (const [index, node] of [...$('color-swatches').children].entries()) node.setAttribute('aria-pressed', String(layer.tint === swatches[index]));
  renderLayers();
}
function renderLayers() {
  $('layer-count').textContent = `${DRAW_ORDER.filter(kind => state.layers[kind].visible && state.layers[kind].id !== 'none').length} LAYERS`;
  $('layer-list').replaceChildren(...[...DRAW_ORDER].reverse().map(kind => {
    const layer = state.layers[kind], asset = selectedAsset(manifest, state, kind);
    const row = element('div', `layer-row${kind === selectedKind ? ' selected' : ''}${!layer.visible ? ' is-hidden' : ''}`);
    const button = element('button', 'layer-select'); button.innerHTML = icon(kind); button.append(element('span', 'layer-title', kind === 'body' ? '身体' : labels[kind]), element('span', 'layer-item', asset?.name || '无')); button.addEventListener('click', () => selectKind(kind));
    const eye = element('button', 'layer-eye'); eye.innerHTML = icon(layer.visible ? 'eye' : 'eye-off'); eye.setAttribute('aria-label', `${layer.visible ? '隐藏' : '显示'}${labels[kind]}`); eye.setAttribute('aria-pressed', String(layer.visible));
    eye.addEventListener('click', () => { layer.visible = !layer.visible; changed(); renderLayers(); }); row.append(button, eye); return row;
  }));
}
async function renderMain() {
  const version = ++renderVersion, current = clone(state);
  try {
    const result = await renderAvatar(null, current, manifest); if (version !== renderVersion) return;
    const canvas = $('avatar-canvas'); canvas.width = manifest.width; canvas.height = manifest.height; canvas.getContext('2d').drawImage(result, 0, 0); $('stage-loading').hidden = true;
    if (view === 'layers') await renderExploded();
  } catch (error) { if (version !== renderVersion) return; $('stage-loading').hidden = true; toast(error.message); }
}
async function renderExploded() {
  const current = clone(state);
  $('exploded-grid').replaceChildren(...['hair', 'body', 'top', 'outer', 'pants', 'shoes'].map((kind, index) => {
    const button = element('button', `exploded-card${selectedKind === kind ? ' active' : ''}`), canvas = document.createElement('canvas'); canvas.width = 260; canvas.height = 360;
    button.append(element('small', '', `0${index + 1} / PNG`), canvas, element('span', '', labels[kind])); button.addEventListener('click', () => selectKind(kind));
    const preview = clone(current);
    if (kind === 'top' || kind === 'body') preview.layers.outer.visible = false;
    if (kind === 'body') preview.layers.top.visible = false;
    void renderLayer(kind, preview, manifest).then(result => { const asset = selectedAsset(manifest, current, kind); fitDrawing(canvas, result, asset?.box || manifest.slots[kind], 14); }).catch(error => { button.title = error.message; }); return button;
  }));
}
async function persist(manual = false) {
  clearTimeout(saveTimer); const snapshot = clone(state); const operation = saveQueue.catch(() => {}).then(() => saveState(snapshot, manifest)); saveQueue = operation;
  try { await operation; if (snapshot.modifiedAt === state.modifiedAt) $('save-status').textContent = '造型已自动保存 · 其他页面可读取'; if (manual) toast('造型已保存，其他页面可以读取完整人物'); }
  catch (error) { $('save-status').textContent = '保存未完成，请导出配置备份'; if (manual) throw error; }
}
function changed(markCustom = true) {
  if (markCustom) state.presetId = 'custom'; state.modifiedAt = new Date().toISOString();
  try { localStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch { /* IndexedDB save below reports errors. */ }
  $('save-status').textContent = '正在保存造型…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => void persist(), 420); updateLookLabel(); void renderMain();
}
function applyPreset(preset) { const customs = state.customAssets; state = createState(manifest, preset.id); state.customAssets = customs; changed(false); updateLibrarySelection(); renderInspector(); }
function renderPresets() {
  $('preset-grid').replaceChildren(...manifest.presets.map(preset => {
    const button = element('button', 'preset-card'); button.type = 'button'; button.dataset.preset = preset.id; button.setAttribute('aria-pressed', String(state.presetId === preset.id)); button.setAttribute('aria-label', `应用${preset.name}整套造型`);
    const canvas = document.createElement('canvas'); canvas.width = 150; canvas.height = 182; const check = element('span', 'preset-check'); check.innerHTML = icon('check');
    button.append(element('span', 'preset-number', preset.number), canvas, element('strong', '', preset.name), check); button.addEventListener('click', () => applyPreset(preset));
    void renderAvatar(null, createState(manifest, preset.id), manifest).then(result => fitDrawing(canvas, result, manifest.characterBounds, 1)).catch(error => { button.title = error.message; }); return button;
  }));
}
function download(blob, filename) {
  const url = URL.createObjectURL(blob), anchor = $('download-ready'), previous = anchor.href;
  anchor.href = url; anchor.download = filename; anchor.hidden = false; anchor.textContent = `下载 ${filename}`;
  anchor.click();
  if (previous.startsWith('blob:')) setTimeout(() => URL.revokeObjectURL(previous), 30000);
}
async function withBusy(button, callback) { button.disabled = true; try { await callback(); } finally { button.disabled = false; } }
function wireControls() {
  iconize();
  $('color-swatches').replaceChildren(...swatches.map(color => { const button = element('button', `swatch${color ? '' : ' original'}`); if (color) button.style.setProperty('--swatch', color); button.setAttribute('aria-label', color || '原画颜色'); button.addEventListener('click', () => { state.layers[selectedKind].tint = color; changed(); renderInspector(); }); return button; }));
  $('custom-color').addEventListener('input', event => { state.layers[selectedKind].tint = event.target.value; changed(); $('color-label').textContent = event.target.value.toUpperCase(); for (const node of $('color-swatches').children) node.setAttribute('aria-pressed', 'false'); });
  $('reset-color').addEventListener('click', () => { state.layers[selectedKind].tint = null; changed(); renderInspector(); });
  $('part-scale').addEventListener('input', event => { state.layers[selectedKind].scale = Number(event.target.value) / 100; $('scale-value').textContent = `${event.target.value}%`; changed(); });
  for (const [id, key] of [['part-x', 'x'], ['part-y', 'y']]) $(id).addEventListener('input', event => { const value = Number(event.target.value); if (!Number.isFinite(value)) return; state.layers[selectedKind][key] = Math.max(-150, Math.min(150, value)); changed(); });
  $('part-opacity').addEventListener('input', event => { state.layers[selectedKind].opacity = Number(event.target.value) / 100; $('opacity-value').textContent = `${event.target.value}%`; changed(); });
  $('asset-fit').addEventListener('change', event => { state.layers[selectedKind].fit = event.target.value; changed(); });
  $('reset-layer').addEventListener('click', () => { const current = state.layers[selectedKind]; state.layers[selectedKind] = { id: current.id, tint: null, x: 0, y: 0, scale: 1, opacity: 1, visible: true, fit: 'part' }; changed(); renderInspector(); toast('已还原当前部件的颜色与位置'); });
  $('save-look').addEventListener('click', safely(() => withBusy($('save-look'), () => persist(true))));
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => { view = button.dataset.view; $('stage').className = `stage ${view}-mode`; $('exploded-grid').hidden = view !== 'layers'; for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab === button)); if (view === 'layers') void renderExploded(); });
  function setZoom(value) { zoom = Math.max(.8, Math.min(1.35, value)); $('character-frame').style.setProperty('--zoom', zoom); $('zoom-label').textContent = `${Math.round(zoom * 100)}%`; }
  $('zoom-in').addEventListener('click', () => setZoom(zoom + .05)); $('zoom-out').addEventListener('click', () => setZoom(zoom - .05)); $('reset-camera').addEventListener('click', () => setZoom(1));
  $('help-open').addEventListener('click', () => $('help-dialog').showModal()); $('help-close').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const r = $('help-dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('help-dialog').close(); } });
  $('asset-upload').addEventListener('change', safely(async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return; const asset = await importAsset(file, selectedKind); state.customAssets[asset.id] = asset;
    state.layers[selectedKind] = { id: asset.id, tint: null, x: 0, y: 0, scale: 1, opacity: 1, visible: true, fit: 'part' }; changed(); renderLibrary(); renderInspector(); toast('已导入 PNG，可在右侧调整大小和位置');
  }));
  $('export-png').addEventListener('click', safely(() => withBusy($('export-png'), async () => { download(await getAvatarBlob(clone(state), manifest), 'luckybreak-character.png'); toast('已导出透明背景完整人物 PNG'); })));
  $('export-config').addEventListener('click', safely(async () => { download(new Blob([JSON.stringify(await exportConfig(clone(state)), null, 2)], { type: 'application/json' }), 'luckybreak-look.json'); toast('配置已导出，包含自定义 PNG 素材'); }));
  $('config-upload').addEventListener('change', safely(async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return; if (file.size > 60 * 1024 * 1024) throw new Error('配置文件不能超过 60 MB。');
    let config; try { config = JSON.parse(await file.text()); } catch { throw new Error('无法解析配置，请选择有效的 JSON 文件。'); }
    state = normalizeState(await importConfig(config, manifest), manifest); changed(false); renderLibrary(); renderInspector(); toast('已恢复造型与自定义素材');
  }));
  $('export-zip').addEventListener('click', safely(() => withBusy($('export-zip'), async () => {
    const current = clone(state), files = await Promise.all(DRAW_ORDER.map(async (kind, index) => ({ name: `layers/0${index}-${kind}.png`, data: await canvasBlob(await renderLayer(kind, current, manifest)) })));
    files.push({ name: 'character.png', data: await getAvatarBlob(current, manifest) }); files.push({ name: 'look.json', data: JSON.stringify(await exportConfig(current), null, 2) });
    files.push({ name: 'README.txt', data: `Lucky Break layered character\nCanvas: ${manifest.width} x ${manifest.height}, transparent PNG.\nComposite layers in filename order from bottom to top at x=0, y=0.\nLayers already include current color, transform, opacity and visibility.\nRoom is excluded. Import look.json to continue editing.\nSDK documentation: public/wardrobe/docs/wardrobe.md in GioGyan90/UI-tool.\n` });
    download(await makeZip(files), 'luckybreak-layered-look.zip'); toast('已导出完整人物、6 个对齐图层和可恢复配置');
  })));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void persist(); });
}
async function init() {
  try {
    manifest = await getManifest(); state = await loadState(manifest); wireControls(); renderCategories(); renderLibrary(); renderInspector(); updateLookLabel(); await renderMain(); renderPresets(); void persist();
    window.LuckyBreakAvatar.getCurrentState = () => clone(state); window.LuckyBreakAvatar.getCurrentPNG = () => getAvatarBlob(clone(state), manifest);
  } catch (error) { $('stage-loading').querySelector('strong').textContent = '试衣间载入失败'; $('stage-loading').querySelector('span:last-child').textContent = `${error.message} 请刷新页面。`; toast(error.message); console.error(error); }
}
void init();
