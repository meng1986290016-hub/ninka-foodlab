# Ninka FoodLab 品牌资产

Ninka FoodLab 的图形标志是一枚“聚合种子”：九个代表原料、营养、成本与配方参数的颗粒，按三乘三网格组合后旋转 45°。它同时表达可计算、可复现的食品配方，以及从配方中生长出的新产品。正式名称始终写作 `Ninka FoodLab`。

## 重新生成与验证

在仓库根目录中运行：

```bash
pnpm brand:generate
pnpm brand:verify
```

`brand:generate` 依次生成图形 SVG、轮廓字标 SVG、PNG、ICO、ICNS 和预览表。`brand:verify` 会检查 SVG 安全性与色板、位图尺寸/模式、ICO 帧、ICNS 尺寸覆盖以及预览表。

在 macOS 上，生成器先按 Apple 规定的十文件 `.iconset` 调用 `iconutil`。如当前系统版本将合法 iconset 拒绝为 `Invalid Iconset`，生成器会用同一组 PNG 写入标准 ICNS 数据块，验证签名、文件大小与 `16–1024 px` 覆盖后才删除临时 iconset。

## 精确色板

| 名称 | HEX | RGB | 用途 |
| --- | --- | --- | --- |
| Forest | `#153D36` | `21, 61, 54` | 主背景、深色字标、单色标志 |
| Grain | `#EFBD50` | `239, 189, 80` | 谷物颗粒与重点色 |
| Tomato | `#DF6B45` | `223, 107, 69` | 食材颗粒与提示色 |
| Cream | `#FFF7E7` | `255, 247, 231` | 暖白背景与深底反白 |

不得用相近色、渐变、霓虹色或透明叠色替换上述颜色。

## 资产索引

- `source/ninka-symbol-color-dark.svg`：Forest 深底彩色图形，数字场景默认版。
- `source/ninka-symbol-color-light.svg`：Cream 浅底彩色图形。
- `source/ninka-symbol-forest.svg` 与 `source/ninka-symbol-cream.svg`：透明背景单色图形。
- `source/ninka-lockup-{horizontal,stacked}-{dark,light}.svg`：横向/竖向、深色/浅色轮廓字标；SVG 不含 `<text>` 或外部字体依赖。
- `png/ninka-icon-{16,24,32,48,64,128,256,512,1024}.png`：RGBA 通用 App 图标。`16–24 px` 使用增大间距的小尺寸版。
- `platform/ninka-foodlab.ico`：Windows 多帧图标，覆盖 `16, 24, 32, 48, 64, 128, 256 px`。
- `platform/ninka-foodlab.icns`：macOS 图标，物理尺寸覆盖 `16, 32, 64, 128, 256, 512, 1024 px`。
- `preview/ninka-brand-sheet.png`：`1600 × 1200` 原尺寸验收表，包含小尺寸图标、横向组合、单色标志与四色色板。
- `fonts/Manrope-VariableFont_wght.ttf`：生成轮廓字标与预览表的源字体。授权条款位于 `fonts/OFL.txt`。

App 图标只包含图形，不包含名称、首字母或标语。

## 最小尺寸与安全区

- 独立图形四周至少保留一个基础模块宽度。
- 横向组合数字场景最小宽度为 `140 px`，印刷场景最小宽度为 `30 mm`。
- 低于横向组合最小尺寸时，只使用独立图形。
- `16–24 px` 只使用已导出的小尺寸 App 图标；不得在此尺寸加字。

## 禁止用法

- 不得更改九个模块的数量、排列、颜色分布或整体 45° 旋转。
- 不得拉伸、压缩、倾斜、拆分或单独旋转模块。
- 不得添加投影、描边、高光、玻璃质感、烧杯、餐具、麦穗、厨师帽或 AI 星光。
- 不得在低对比度照片上直接放置彩色标志，也不得以 Grain/Tomato 单独承载关键小字。
- 字标中 `FoodLab` 不得比 `Ninka` 更粗或更醒目，正式名称不得写为 `NInka`、`NINKA` 或 `Food Lab`。

## 未来 Tauri 2 接入目标

Tauri 桌面应用创建后，将已验证资产复制到 `apps/desktop/src-tauri/icons/`：

| 品牌源资产 | Tauri 目标 |
| --- | --- |
| `platform/ninka-foodlab.ico` | `apps/desktop/src-tauri/icons/icon.ico` |
| `platform/ninka-foodlab.icns` | `apps/desktop/src-tauri/icons/icon.icns` |
| `png/ninka-icon-32.png` | `apps/desktop/src-tauri/icons/32x32.png` |
| `png/ninka-icon-128.png` | `apps/desktop/src-tauri/icons/128x128.png` |
| `png/ninka-icon-256.png` | `apps/desktop/src-tauri/icons/128x128@2x.png` |
| `png/ninka-icon-512.png` | `apps/desktop/src-tauri/icons/icon.png` |

仅在 Tauri 壳创建后更新 `apps/desktop/src-tauri/tauri.conf.json` 的 `bundle.icon` 路径；当前品牌生成器不修改计算包或其依赖。
