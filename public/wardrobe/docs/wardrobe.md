# Lucky Break 人物造型室

独立页面位于 `public/wardrobe/`，由原 UI 工作台顶部入口进入。房间只作为预览背景；人物由真实透明 PNG 合成，可供其他页面和 Three.js 读取。

在线页面：https://giogyan90.github.io/UI-tool/wardrobe/index.html

读取示例：https://giogyan90.github.io/UI-tool/wardrobe/reader.html

![已发布页面预览](preview.jpg)

## 本地运行与发布

```bash
git clone https://github.com/GioGyan90/UI-tool.git
cd UI-tool
npm ci
npm run dev
# http://localhost:3000/wardrobe/index.html
```

新页面无需 API Key、AI 服务、Node 后端或外部 CDN 即可使用。也可以执行 `npm run dev:wardrobe`，只启动独立静态页面开发服务（默认 localhost:5173）。原 UI 编辑工具的服务端功能仍按原项目运行。`npm run build` 将原工具及 `public/wardrobe/` 一起放进 `dist/`。GitHub Actions 的 `.github/workflows/pages.yml` 在 main 更新后构建并发布整个 dist；Vite 使用相对 base 以支持仓库子路径。

## 已有素材与编辑范围

画布统一为 **948 × 1659**。角色是成年男青年，略朝右侧的四分之三站姿，双手自然垂放，以减少换装时袖长、手掌与裤袋的耦合。参考 T1–T5 重新生成插画，再拆件、裁透明边、校准大小与位置，并非只用五张完整图片切换。

| 类别 | 独立 PNG 素材 |
| --- | --- |
| 身体 | 固定身份的头颈、裸露手臂与手掌 |
| 发型 | 黑色随性中分、金色微卷 |
| 内搭 | 短袖 T 恤、白衬衫、酒红高领针织、礼服衬衫与马甲 |
| 外套 | 飞行夹克、工装夹克、长风衣、礼服西装；可不穿外套 |
| 裤装 | 修身西裤、破洞牛仔裤、休闲裤 |
| 鞋履 | 系带皮鞋、黑白帆布鞋 |

共 **16 个真实 PNG 素材**，约 **3.75 MB**，另有房间 JPG。五套预设为日常轻装、夜行夹克、远行工装、暖金风衣、紫藤礼服。发型与服装可跨套组合；每层支持颜色、位置、缩放、不透明度、显隐及自定义 PNG 导入。此版本马甲和领带属于礼服内搭层。

素材文件在 `public/wardrobe/assets/`，每个 PNG 裁掉无用透明边，位置由 `manifest.json` 中的 `box: [x,y,width,height]` 定义。单个文件不等于完整人物画布，不能忽略 box。完整画布的每层 PNG 可从页面导出。

内搭合成时根据外套轮廓裁去超出的肩袖，保留真正透明的前襟开口。长袖服装会遮住基础手臂，仅保留手掌和头颈；鞋先画、裤后画，使裤脚盖住鞋口。破洞裤的封闭孔洞补入肤色，避免透出房间。换色按各素材亮度中间值保留明暗，允许将深色西裤染成浅紫色。

## 读取完整人物

打开 `wardrobe/reader.html` 可实际验证不同页面同步。编辑状态在当前浏览器自动保存，IndexedDB 存自定义 PNG 与状态，localStorage 保存轻量配置备份，BroadcastChannel / storage 事件通知其他页面。浏览器保存不等于跨设备云存档；换设备请导入带素材的配置 JSON。

在**同源**任意页面中使用：

```html
<canvas id="character"></canvas>
<script type="module">
  import { loadState, renderAvatar, subscribeAvatar, getAvatarBlob }
    from './wardrobe/avatar-sdk.js';

  const canvas = document.querySelector('#character');
  await renderAvatar(canvas, await loadState());
  const unsubscribe = subscribeAvatar(state => renderAvatar(canvas, state));
  // 页面/组件卸载时调用 unsubscribe()。
  // const transparentPNG = await getAvatarBlob(); // Blob, image/png
</script>
```

在工具页面本身也可以通过 `window.LuckyBreakAvatar.getCurrentState()` 取得当前配置，通过 `getCurrentPNG()` 取得当前完整人物 PNG Blob。SDK 的通用方法包括 `getManifest()`、`createState(manifest, presetId)`、`loadState()`、`saveState(state)`、`renderAvatar(canvas, state)`、`renderLayer(kind,state)`、`getAvatarBlob(state)`、`subscribeAvatar(callback)`、`exportConfig(state)` 与 `importConfig(config)`。

仅嵌入透明人物，不显示示例说明：

```html
<iframe src="./wardrobe/reader.html?embed=1"
  title="当前人物" style="width:380px;height:665px;border:0"></iframe>
```

Three.js 示例（沿用游戏已有的 three 依赖）：

```js
import * as THREE from 'three';
import { loadState, renderAvatar, subscribeAvatar } from './wardrobe/avatar-sdk.js';

const canvas = document.createElement('canvas');
await renderAvatar(canvas, await loadState());
const texture = new THREE.CanvasTexture(canvas);
texture.colorSpace = THREE.SRGBColorSpace;
const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
const sprite = new THREE.Sprite(material);
sprite.scale.set(948 / 1659 * 2, 2, 1);
scene.add(sprite);
const stop = subscribeAvatar(async state => {
  await renderAvatar(canvas, state);
  texture.needsUpdate = true;
});
// 卸载：stop(); material.dispose(); texture.dispose();
```

跨域、跨设备或本地游戏使用时，将 `public/wardrobe/` 一并复制进游戏资源目录，导入配置与自定义素材再合成，或直接使用导出的完整 PNG。浏览器本地存储不会自动跨域共享。自定义素材只接受真实 PNG，单件最大 10 MB，宽高最大 4096；导入定位可选择部件适配或完整画布对齐。

## 导出

- **透明人物 PNG**：只导出人物，无房间、地毯或 UI，原始画布尺寸。
- **分层 PNG ZIP**：`character.png`、6 个统一尺寸的图层 PNG、含自定义素材的 `look.json` 与说明。图层文件已烘焙当前颜色、变换、透明度、显隐和遮挡裁剪。按文件名顺序从下往上以 `(0,0)` 叠加可复现完整人物。
- **配置 JSON**：可回到造型室继续编辑，包含自定义 PNG 数据。

原始完整部件 PNG 保留在 assets，导出的当前外观图层可能因外套遮挡而被裁剪。房间、透明底、拆解模式和预览缩放不影响最终导出构图。

## 继续增加素材

1. 以相同人物姿势、面部角度、肢体位置生成真正透明背景的单件插画；不能让衣服生成时带上头脸、皮肤、其他衣物或鞋。
2. 保持领口、肩、腰、腕、脚踝基准，生成后按 `manifest.json` 校准。长外套必须具有真实的前襟透明开口。
3. 将新文件加入 assets，再加入 manifest 同类别的素材项。需要时设置 `sleeve: "long"`，并做无外套、短夹克、风衣等交叉组合检查。
4. 一般不需要重新生成身体。改变姿势则需重建整个套件，不能把不同站姿的服装直接混用。

`public/wardrobe/scripts/prepare-wardrobe-assets.mjs` 是机械素材整理脚本：输入本地生成 PNG 路径映射（键为素材 ID，房间键为 room），使用 sharp 裁透明边、拆分左右鞋及身体、校准坐标、导出 manifest。只在重新整理源插画时运行；日常构建无需 sharp，也不会调用图像服务。

## 检查

```bash
node public/wardrobe/scripts/check-wardrobe.mjs
node --test public/wardrobe/tests/wardrobe.test.mjs
npx tsc --noEmit
npm run build
```

还需在浏览器目测五套完整人物、至少一组交叉混搭、透明底、拆解模式、PNG/ZIP 导出、上传与配置恢复，以及 reader 页跨标签同步。发布后的页面也应实际打开，确认资源在 GitHub 仓库路径下可加载。

2026-11-02 验收记录：素材检查、3 项配置/ZIP 测试、TypeScript 检查及 Vite 构建通过；GitHub Actions 构建和 Pages 部署成功，外部页面已实际打开。桌面与 390px 预览目测完成，浏览器自定义 PNG 导入、含自定义 PNG/颜色/位置的 JSON 恢复、跨标签人物同步通过。底层渲染器导出五套透明 PNG 和礼服分层 ZIP，ZIP CRC 正确，6 层重合成 alpha 完全一致，预乘 RGB 误差不超过 2/255（透明边缘舍入）。云浏览器能生成导出与下载链接，但未能捕获 Blob 下载事件；导出内容已在渲染器和 ZIP 层验证。
