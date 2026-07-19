# Ninka FoodLab 品牌资产

Ninka FoodLab 的图形标志是一枚“聚合种子”：九个代表原料、营养、成本与配方参数的颗粒，按三乘三网格组合后旋转 45°。它同时表达可计算、可复现的食品配方，以及从配方中生长出的新产品。正式名称始终写作 `Ninka FoodLab`。

## 重新生成与验证

从全新 checkout 开始时，需要 Python 3.12 或更高版本。在仓库根目录创建与 `package.json` 脚本约定一致的独立环境，并安装锁定的品牌生成依赖：

```bash
python3.12 -m venv .venv-branding
.venv-branding/bin/python -m pip install -r scripts/branding/requirements.txt
```

然后使用仓库脚本生成和验证资产：

```bash
pnpm brand:generate
pnpm brand:verify
```

`brand:generate` 和 `brand:verify` 都会通过 `.venv-branding/bin/python` 运行，因此虚拟环境的目录名不得更改。`brand:generate` 依次生成图形 SVG、轮廓字标 SVG、PNG、ICO、ICNS 和预览表。`brand:verify` 会检查 SVG 根元素、标签白名单、安全性与色板，并将 8 个源 SVG 与确定性生成器输出逐字节比较；每个 PNG 像素、每个 ICO 帧、ICNS 内全部 10 个 PNG 表示和完整预览表也会与确定性渲染结果逐像素比较。只有尺寸或文件签名正确、但品牌内容被替换的文件不会通过验证。

在 macOS 上，生成器先按 Apple 规定的十文件 `.iconset` 调用 `iconutil`。如 `iconutil` 拒绝 iconset，或它生成的 ICNS 缺少表示/像素不匹配，生成器会用同一组 PNG 写入标准 ICNS 数据块。在 Linux 等非 macOS 环境中，直接使用该平台无关后备路径，不依赖已有或过期 ICNS。

生成器会解码 ICNS 内 `16@1x、16@2x、32@1x、32@2x、128@1x、128@2x、256@1x、256@2x、512@1x、512@2x` 全部 10 个 PNG 表示，确认尺寸与品牌像素后才删除临时 iconset。如后备输出仍未通过最终验证，无效 ICNS 会被删除，完整 iconset 则保留供诊断。

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
- `platform/ninka-foodlab.icns`：macOS 图标，包含 10 个已验证 PNG 表示，物理尺寸覆盖 `16, 32, 64, 128, 256, 512, 1024 px`。
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
