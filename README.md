<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

## 人物造型室

在线体验：[人物造型室](https://giogyan90.github.io/UI-tool/wardrobe/index.html) · [其他页面读取示例](https://giogyan90.github.io/UI-tool/wardrobe/reader.html)

新增独立工具页面：[`public/wardrobe/`](public/wardrobe/)，本地启动后打开 `http://localhost:3000/wardrobe/index.html`。包含房间试衣预览、18 个独立透明 PNG 素材、5 套可混搭造型、单层换色与定位、自定义 PNG、完整人物与分层包导出，以及其他页面读取示例。头部、颈部与锁骨、手臂现为独立图层，衬衣朝向及前后衣领遮挡已统一。

接入和素材说明见 [docs/wardrobe.md](public/wardrobe/docs/wardrobe.md)。新页面无需 API Key。main 更新后通过 GitHub Actions 发布到 Pages。

![人物造型室预览](public/wardrobe/docs/preview.jpg)

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/3242cb9e-b2a0-4272-84f0-dcb45316e9b1

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`
