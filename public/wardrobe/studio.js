import { CATEGORIES, CALIBRATION_KINDS, BACK_PARENTS, DRAW_ORDER, STATE_KEY, getManifest, createState, normalizeState, loadState, saveState, listSavedPresets, savePreset, renderAvatar, renderLayer, selectedAsset, canvasBlob, getAvatarBlob, renderCompositeLayers, importAsset, exportConfig, importConfig } from './avatar-sdk.js?v=20261103-alignment1';
import { makeZip } from './zip.js';
import { icon, iconize } from './icons.js';
const labels = { hair: '发型', 'hair-back':'后发', 'outer-back':'后衬', top: '内搭', outer: '外套', pants: '裤装', shoes: '鞋履', body: '手臂', head: '头部', neck: '颈部' };
const $ = id => document.getElementById(id);
const clone = value => JSON.parse(JSON.stringify(value));
let manifest, state, saveTimer, toastTimer;
let selectedKind = 'hair', view = 'room', zoom = 1, renderVersion = 0;
let saveQueue = Promise.resolve();
let savedPresets = [], presetBusy = false;
const LIBRARY_KINDS = ['hair', 'hair-back', 'head', 'neck', 'top', 'outer', 'outer-back', 'pants', 'shoes'];
const freshLayer=(id,kind)=>({id,tint:null,x:0,y:0,scale:1,scaleX:1,scaleY:1,opacity:1,visible:true,fit:'part',followParent:!!BACK_PARENTS[kind]});
const decimal = value => Number(value.toFixed(1));
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
  preview.layers[asset.kind] = freshLayer(asset.id,asset.kind);
  if(BACK_PARENTS[asset.kind])preview.layers[asset.kind].followParent=false;
  let result = await renderLayer(asset.kind, preview, manifest);
  if(asset.kind==='hair'&&asset.backAsset){
    preview.layers['hair-back']=freshLayer(asset.backAsset,'hair-back');
    const rear=await renderLayer('hair-back',preview,manifest),joined=document.createElement('canvas');joined.width=result.width;joined.height=result.height;
    joined.getContext('2d').drawImage(rear,0,0);joined.getContext('2d').drawImage(result,0,0);result=joined;
  }
  fitDrawing(canvas, result, asset.thumbBox || asset.box || manifest.slots[asset.kind], asset.kind === 'hair' ? 18 : 12);
}
function updateLookLabel() {
  const preset = manifest.presets.find(p => p.id === state.presetId);
  $('look-number').textContent = preset ? `LOOK ${preset.number}` : 'YOUR LOOK';
  $('current-look-kicker').textContent = preset ? `${preset.number} / ${preset.english}` : 'A LOOK THAT IS YOURS';
  $('current-look-name').textContent = preset?.name || state.lookName || '自由混搭';
  for (const node of $('preset-grid').children) node.setAttribute('aria-pressed', String(node.dataset.preset === state.presetId));
}
function renderCategories() {
  $('category-tabs').replaceChildren(...LIBRARY_KINDS.map(kind => {
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
    if (asset.id === 'none'||asset.empty) { const empty = element('span', 'empty-asset'); empty.innerHTML = icon('close'); thumb.append(empty); }
    else { const canvas = document.createElement('canvas'); canvas.width = 220; canvas.height = 225; thumb.append(canvas); void assetThumb(asset, canvas).catch(error => { button.title = error.message; thumb.textContent = '素材加载失败'; }); }
    const tag = element('span', 'asset-tag', asset.id.startsWith('user-') ? 'YOUR PNG' : 'ORIGINAL'); const check = element('span', 'check'); check.innerHTML = icon('check');
    button.append(thumb, tag, check, element('span', 'card-text', asset.name));
    button.addEventListener('click', () => {
      if (state.layers[selectedKind].id === asset.id) return;
      state.layers[selectedKind] = freshLayer(asset.id,selectedKind);
      for(const [rear,parent] of Object.entries(BACK_PARENTS))if(parent===selectedKind)state.layers[rear]=freshLayer(asset.backAsset||manifest.defaults[rear],rear);
      changed(); updateLibrarySelection(); renderInspector();
    }); return button;
  }));
  $('asset-upload').disabled = !CATEGORIES.includes(selectedKind); $('asset-upload').parentElement.style.display = CATEGORIES.includes(selectedKind) ? 'flex' : 'none';
}
function updateLibrarySelection() { for (const item of $('asset-grid').children) item.setAttribute('aria-pressed', String(item.dataset.asset === state.layers[selectedKind].id)); }
function selectKind(kind) { selectedKind = kind; for (const tab of $('category-tabs').children) tab.setAttribute('aria-selected', String(tab.dataset.kind === kind)); renderLibrary(); renderInspector(); if (view === 'layers') void renderExploded(); }
function renderInspector() {
  const layer = state.layers[selectedKind], asset = selectedAsset(manifest, state, selectedKind);
  const calibration = CALIBRATION_KINDS.includes(selectedKind);
  $('piece-icon').innerHTML = icon(selectedKind); $('selected-category').textContent = labels[selectedKind]; $('selected-name').textContent = asset?.name || '无';
  for (const id of ['part-scale', 'part-scale-number']) {
    $(id).min = calibration ? 25 : 75; $(id).max = calibration ? 250 : 125; $(id).value = decimal(layer.scale * 100);
  }
  for (const id of ['part-x', 'part-y']) { $(id).min = calibration ? -400 : -150; $(id).max = calibration ? 400 : 150; }
  $('axis-size-fields').hidden = !calibration;
  $('part-width').value = decimal((layer.scaleX ?? 1) * 100); $('part-height').value = decimal((layer.scaleY ?? 1) * 100);
  $('calibration-note').textContent = BACK_PARENTS[selectedKind]&&layer.followParent ? `跟随${labels[BACK_PARENTS[selectedKind]]} · 下面的参数用于后层的额外微调。` : calibration ? `${labels[selectedKind]}独立调整 · X/Y 为原画偏移，宽高可分别修改。` : 'X/Y 为原画偏移，整体缩放保持部件比例。';
  $('follow-parent-row').hidden=!BACK_PARENTS[selectedKind];$('follow-parent').checked=layer.followParent!==false;
  $('follow-parent-label').textContent=BACK_PARENTS[selectedKind]?`跟随${labels[BACK_PARENTS[selectedKind]]}的位置、缩放与显隐`:'跟随前层';
  $('part-x').value = layer.x; $('part-y').value = layer.y; $('part-opacity').value = Math.round(layer.opacity * 100); $('opacity-value').textContent = `${Math.round(layer.opacity * 100)}%`;
  $('color-label').textContent = layer.tint?.toUpperCase() || '原画配色'; $('custom-color').value = layer.tint || '#5b5d50'; $('asset-fit-row').hidden = !asset?.id.startsWith('user-'); $('asset-fit').value = layer.fit;
  for (const [index, node] of [...$('color-swatches').children].entries()) node.setAttribute('aria-pressed', String(layer.tint === swatches[index]));
  renderLayers();
}
function renderLayers() {
  $('layer-count').textContent = `${DRAW_ORDER.filter(kind => state.layers[kind].visible && state.layers[kind].id !== 'none'&&!selectedAsset(manifest,state,kind)?.empty).length} / ${DRAW_ORDER.length} 层`;
  $('layer-list').replaceChildren(...[...DRAW_ORDER].reverse().map(kind => {
    const layer = state.layers[kind], asset = selectedAsset(manifest, state, kind);
    const row = element('div', `layer-row${kind === selectedKind ? ' selected' : ''}${!layer.visible ? ' is-hidden' : ''}`);
    const button = element('button', 'layer-select'); button.innerHTML = icon(kind); button.append(element('span', 'layer-title', labels[kind]), element('span', 'layer-item', asset?.name || '无')); button.addEventListener('click', () => selectKind(kind));
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
  $('exploded-grid').replaceChildren(...['hair', 'hair-back', 'head', 'neck', 'body', 'top', 'outer', 'outer-back', 'pants', 'shoes'].map((kind, index) => {
    const button = element('button', `exploded-card${selectedKind === kind ? ' active' : ''}`), canvas = document.createElement('canvas'); canvas.width = 260; canvas.height = 360;
    button.append(element('small', '', `${String(index+1).padStart(2,'0')} / PNG`), canvas, element('span', '', labels[kind])); button.addEventListener('click', () => selectKind(kind));
    const preview = clone(current);
    if(BACK_PARENTS[kind])preview.layers[kind].followParent=false;
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
async function renderPresets() {
  const pending=[];
  $('preset-grid').replaceChildren(...manifest.presets.map(preset => {
    const button = element('button', 'preset-card'); button.type = 'button'; button.dataset.preset = preset.id; button.setAttribute('aria-pressed', String(state.presetId === preset.id)); button.setAttribute('aria-label', `应用${preset.name}整套造型`);
    const canvas = document.createElement('canvas'); canvas.width = 150; canvas.height = 182; const check = element('span', 'preset-check'); check.innerHTML = icon('check');
    button.append(element('span', 'preset-number', preset.number), canvas, element('strong', '', preset.name), check); button.addEventListener('click', () => applyPreset(preset));
    pending.push({preset,canvas,button}); return button;
  }));
  for(const {preset,canvas,button} of pending){try{fitDrawing(canvas,await renderAvatar(null,createState(manifest,preset.id),manifest),manifest.characterBounds,1);}catch(error){button.title=error.message;}}
}
function updatePresetButtons() {
  const selected = savedPresets.some(record => record.id === $('saved-preset-select').value);
  $('preset-save-new').disabled = presetBusy;
  $('preset-update').disabled = presetBusy || !selected;
  $('preset-apply').disabled = presetBusy || !selected;
  $('saved-preset-select').disabled = presetBusy || !savedPresets.length;
  $('preset-name').disabled = presetBusy;
}
async function refreshSavedPresets(selectedId = state.savedPresetId) {
  savedPresets = await listSavedPresets(manifest);
  const placeholder = element('option', '', savedPresets.length ? '选择一个预设' : '还没有命名预设'); placeholder.value = '';
  $('saved-preset-select').replaceChildren(placeholder, ...savedPresets.map(record => {
    const option = element('option', '', record.name); option.value = record.id; return option;
  }));
  $('saved-preset-select').value = savedPresets.some(record => record.id === selectedId) ? selectedId : '';
  $('preset-open').textContent = savedPresets.length ? `我的预设 · ${savedPresets.length}` : '我的预设';
  updatePresetButtons();
}
async function openPresetDialog() {
  if (presetBusy) return;
  presetBusy = true; updatePresetButtons();
  $('preset-name').value = state.lookName || '';
  $('preset-status').textContent = '正在读取已保存的预设…';
  $('preset-dialog').showModal();
  try { await refreshSavedPresets(); $('preset-status').textContent = '预设保存在当前浏览器。跨设备请导出配置 JSON 备份。'; }
  catch (error) { $('preset-status').textContent = error.message; }
  finally { presetBusy = false; updatePresetButtons(); $('preset-name').focus(); }
}
async function storeNamedPreset(update = false) {
  presetBusy = true; updatePresetButtons();
  try {
    const snapshot = clone(state), id = update ? $('saved-preset-select').value : null;
    if (update && !id) throw new Error('请先选择要更新的预设。');
    const record = await savePreset(snapshot, $('preset-name').value, { id, manifest });
    // Retain any live edits made while IndexedDB was writing the saved snapshot.
    const newerEdits = snapshot.modifiedAt !== state.modifiedAt;
    state.savedPresetId = record.id; state.lookName = record.name; state.presetId = 'custom';
    changed(false); await persist(); await refreshSavedPresets(record.id);
    $('preset-status').textContent = `${update ? '已更新' : '已保存'}「${record.name}」，包含发型、头部、颈部参数及整套造型。${newerEdits ? '当前又有调整，可再点击更新。' : ''}`;
    toast(update ? '预设已更新' : '新预设已保存');
  } catch (error) { $('preset-status').textContent = error.message; }
  finally { presetBusy = false; updatePresetButtons(); }
}
function applySavedPreset() {
  const record = savedPresets.find(item => item.id === $('saved-preset-select').value);
  if (!record) return;
  const customAssets = { ...record.state.customAssets, ...state.customAssets };
  state = normalizeState({ ...clone(record.state), customAssets }, manifest);
  changed(false); renderLibrary(); renderInspector(); $('preset-dialog').close(); toast(`已应用「${record.name}」`);
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
  function numericControl(id, key, divisor = 1) {
    const input = $(id);
    input.addEventListener('input', () => {
      if (input.value === '' || !Number.isFinite(input.valueAsNumber)) return;
      const value = Math.max(Number(input.min), Math.min(Number(input.max), input.valueAsNumber));
      state.layers[selectedKind][key] = value / divisor;
      if (key === 'scale') for (const partner of ['part-scale', 'part-scale-number']) if (partner !== id) $(partner).value = decimal(value);
      changed();
    });
    input.addEventListener('change', () => { input.value = decimal(state.layers[selectedKind][key] * divisor); });
  }
  for (const id of ['part-scale', 'part-scale-number']) numericControl(id, 'scale', 100);
  numericControl('part-x', 'x'); numericControl('part-y', 'y'); numericControl('part-width', 'scaleX', 100); numericControl('part-height', 'scaleY', 100);
  $('part-opacity').addEventListener('input', event => { state.layers[selectedKind].opacity = Number(event.target.value) / 100; $('opacity-value').textContent = `${event.target.value}%`; changed(); });
  $('asset-fit').addEventListener('change', event => { state.layers[selectedKind].fit = event.target.value; changed(); });
  $('reset-layer').addEventListener('click', () => { state.layers[selectedKind] = freshLayer(state.layers[selectedKind].id,selectedKind); changed(); renderInspector(); toast('已还原当前部件的颜色与位置'); });
  $('follow-parent').addEventListener('change',event=>{state.layers[selectedKind].followParent=event.target.checked;changed();renderInspector();});
  $('save-look').addEventListener('click', safely(openPresetDialog)); $('preset-open').addEventListener('click', safely(openPresetDialog));
  $('preset-close').addEventListener('click', () => $('preset-dialog').close());
  $('preset-save-new').addEventListener('click', () => void storeNamedPreset()); $('preset-update').addEventListener('click', () => void storeNamedPreset(true));
  $('preset-apply').addEventListener('click', applySavedPreset);
  $('saved-preset-select').addEventListener('change', () => {
    const record = savedPresets.find(item => item.id === $('saved-preset-select').value);
    if (record) $('preset-name').value = record.name;
    $('preset-status').textContent = record ? '应用可恢复保存的造型；更新会将当前画面和参数写入所选预设。' : '请命名并保存新预设。';
    updatePresetButtons();
  });
  for (const button of document.querySelectorAll('[data-view]')) button.addEventListener('click', () => { view = button.dataset.view; $('stage').className = `stage ${view}-mode`; $('exploded-grid').hidden = view !== 'layers'; for (const tab of document.querySelectorAll('[data-view]')) tab.setAttribute('aria-pressed', String(tab === button)); if (view === 'layers') void renderExploded(); });
  function setZoom(value) { zoom = Math.max(.8, Math.min(1.35, value)); $('character-frame').style.setProperty('--zoom', zoom); $('zoom-label').textContent = `${Math.round(zoom * 100)}%`; }
  $('zoom-in').addEventListener('click', () => setZoom(zoom + .05)); $('zoom-out').addEventListener('click', () => setZoom(zoom - .05)); $('reset-camera').addEventListener('click', () => setZoom(1));
  $('help-open').addEventListener('click', () => $('help-dialog').showModal()); $('help-close').addEventListener('click', () => $('help-dialog').close());
  $('help-dialog').addEventListener('click', event => { if (event.target === $('help-dialog')) { const r = $('help-dialog').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('help-dialog').close(); } });
  $('asset-upload').addEventListener('change', safely(async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return; const asset = await importAsset(file, selectedKind); state.customAssets[asset.id] = asset;
    state.layers[selectedKind] = freshLayer(asset.id,selectedKind); changed(); renderLibrary(); renderInspector(); toast('已导入 PNG，可在右侧调整大小和位置');
  }));
  $('export-png').addEventListener('click', safely(() => withBusy($('export-png'), async () => { download(await getAvatarBlob(clone(state), manifest), 'luckybreak-character.png'); toast('已导出透明背景完整人物 PNG'); })));
  $('export-config').addEventListener('click', safely(async () => { download(new Blob([JSON.stringify(await exportConfig(clone(state)), null, 2)], { type: 'application/json' }), 'luckybreak-look.json'); toast('配置已导出，包含自定义 PNG 素材'); }));
  $('config-upload').addEventListener('change', safely(async event => {
    const file = event.target.files[0]; event.target.value = ''; if (!file) return; if (file.size > 60 * 1024 * 1024) throw new Error('配置文件不能超过 60 MB。');
    let config; try { config = JSON.parse(await file.text()); } catch { throw new Error('无法解析配置，请选择有效的 JSON 文件。'); }
    state = normalizeState(await importConfig(config, manifest), manifest); changed(false); renderLibrary(); renderInspector(); toast('已恢复造型与自定义素材');
  }));
  $('export-zip').addEventListener('click', safely(() => withBusy($('export-zip'), async () => {
    const current = clone(state), stack = await renderCompositeLayers(current, manifest);
    const files = await Promise.all(stack.map(async ({kind,canvas},index) => ({name:`layers/${String(index).padStart(2,'0')}-${kind}.png`,data:await canvasBlob(canvas)})));
    files.push({ name: 'character.png', data: await getAvatarBlob(current, manifest) }); files.push({ name: 'look.json', data: JSON.stringify(await exportConfig(current), null, 2) });
    files.push({ name: 'README.txt', data: `Lucky Break layered character\nCanvas: ${manifest.width} x ${manifest.height}, transparent PNG.\nComposite layers in filename order from bottom to top at x=0, y=0.\nLayers already include current color, transform, opacity and visibility.\nRoom is excluded. Import look.json to continue editing.\nSDK documentation: public/wardrobe/docs/wardrobe.md in GioGyan90/UI-tool.\n` });
    download(await makeZip(files), 'luckybreak-layered-look.zip'); toast(`已导出完整人物、${stack.length} 个对齐图层和可恢复配置`);
  })));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void persist(); });
}
async function init() {
  try {
    manifest = await getManifest(); state = await loadState(manifest); wireControls(); renderCategories(); renderLibrary(); renderInspector(); updateLookLabel(); await renderMain(); renderPresets(); void persist();
    void refreshSavedPresets().catch(error => { $('preset-open').title = error.message; });
    window.LuckyBreakAvatar.getCurrentState = () => clone(state); window.LuckyBreakAvatar.getCurrentPNG = () => getAvatarBlob(clone(state), manifest);
  } catch (error) { $('stage-loading').querySelector('strong').textContent = '试衣间载入失败'; $('stage-loading').querySelector('span:last-child').textContent = `${error.message} 请刷新页面。`; toast(error.message); console.error(error); }
}
void init();
