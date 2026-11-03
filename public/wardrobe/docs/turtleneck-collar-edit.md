# 暖金风衣内搭领口修正

2026-11-03。用户最终要求：领子左右对称，不出现背面；脖子不应盖断正面衣领。

## 最终资产

- `public/wardrobe/assets/top-turtleneck.png`：原内搭，保留为制作源。
- `public/wardrobe/assets/top-turtleneck-collar-source.png`：内置图像生成工具编辑后的局部透明补片，165 × 115，已配准到原图 `[148,0,165,115]`。
- `public/wardrobe/assets/top-turtleneck-v2.png`：运行时内搭，452 × 596。
- `public/wardrobe/scripts/turtleneck-collar.mjs`：从原图和局部补片重建最终衣服。
- `public/wardrobe/docs/turtleneck-collar-comparison.jpg`：同一头颈及风衣状态的前后对比。

使用内置图像工具编辑原高领插画，未调用额外图像 API。只保留并配准领口补片，衣服其他部位沿用原图。补片按颈部中线校准为对称的浅 U 形边缘；左右对应列上缘的差异不超过 1 个原画像素。上沿的两端等高，中央较低，背面和内腔均不进入运行时素材。

高领不再配置 `rearCollar`，旧的 `top-turtleneck-rear-mask.png` 已移除。十二层导出结构保留；使用该内搭时，`top-collar-back` 是透明空层。其他衣服仍按原遮挡关系处理。

## 最终图像编辑简报

```text
Use case: precise-object-edit. EDIT the supplied transparent isolated burgundy turtleneck shirt asset. Change ONLY the collar opening at the top. The new collar must be STRICTLY LEFT-RIGHT SYMMETRICAL: the two top outer corners at exactly the same height, rounded corners, a single smooth shallow U-shaped concave top edge lowest at its exact horizontal center, like the FRONT fabric band fitted around the throat. Show ONLY THE FRONT OF THE COLLAR. There must be NO back rim, NO rear part, NO oval ellipse, NO visible inside fabric, NO dark hole, NO interior or top-facing surface. The entire region ABOVE the SINGLE U-shaped top edge must be genuinely transparent, a cutout where the separate neck will be placed. Keep the collar tall with burgundy cel-shaded front fabric below this single U curve, a thin continuous dark outline, and gentle symmetrical front collar folds. Think of a front-view U-neck edge on a tall fitted turtleneck, NOT a hollow cylinder. Preserve the exact original deep burgundy palette, anime line style, all shoulders, torso, sleeves, pose, cuffs, waist, lower folds and their positions. Keep the whole garment at the same relative scale and fully visible on actual transparent background. No body, skin, head, mannequin, text, background, extra objects. Symmetric front collar only is the overriding requirement.
```

## 验收

`verify-wardrobe-render.mjs` 检查五套造型、20 组内外搭、十二层重合成与 ZIP，以及本轮的以下回归条件：

1. 领口左右对应列的弧线对称，上沿上方没有后领或深色内腔的 alpha。
2. 正面衣领始终绘制在颈部之前，头部像素不会切过领边；高领后片为空。
3. 补片区域外的肩、胸、袖、腰像素与原图完全一致。
4. 原有头颈锚点、前后发、风衣内摆、命名预设参数和十二层导出结构保持有效。

日常构建使用现成 PNG，无需运行图像服务或重新生成素材。需要重建时执行 `node public/wardrobe/scripts/build-wardrobe-anatomy.mjs`。
