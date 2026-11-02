import { getManifest, loadState, renderAvatar, subscribeAvatar, getAvatarBlob } from './avatar-sdk.js?v=20261102-backlayers1';
const $ = id => document.getElementById(id);
let state, version = 0;
async function update(next) {
  const current = ++version;
  state = next || await loadState();
  const snapshot = state;
  try {
    const manifest = await getManifest();
    const result = await renderAvatar(null, snapshot, manifest);
    if (current !== version) return;
    const canvas = $('reader-canvas'); canvas.width = result.width; canvas.height = result.height;
    canvas.getContext('2d').drawImage(result, 0, 0);
    $('reader-status').textContent = '已连接 · 等待造型室的下一次更新';
    $('reader-look').textContent = manifest.presets.find(p => p.id === snapshot.presetId)?.name || snapshot.lookName || '自由混搭';
    $('reader-updated').textContent = new Date(snapshot.modifiedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  } catch (error) { $('reader-status').textContent = error.message; }
}
const stop = subscribeAvatar(update);
window.addEventListener('pagehide', () => stop(), { once: true });
$('reader-refresh').addEventListener('click', () => void update());
$('reader-download').addEventListener('click', async () => {
  const button = $('reader-download'); button.disabled = true;
  try {
    const url = URL.createObjectURL(await getAvatarBlob(state));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'luckybreak-character.png'; document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } catch (error) { $('reader-status').textContent = error.message; }
  finally { button.disabled = false; }
});
if (new URLSearchParams(location.search).has('embed')) {
  document.querySelector('.app-header').hidden = true;
  document.querySelector('.reader-info').hidden = true;
  document.querySelector('.reader-main').style.cssText = 'display:block;margin:0;padding:0;max-width:none';
  document.querySelector('.reader-preview').style.cssText = 'height:100svh;min-height:0;padding:0;border:0;border-radius:0;background:none';
  document.body.style.background = 'transparent';
}
void update();
