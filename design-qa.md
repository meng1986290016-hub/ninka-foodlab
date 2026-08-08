# Ninka FoodLab 基础品牌接入 QA

- source visual truth path: `/Users/andrew/Documents/食品研发工具/assets/branding/preview/ninka-brand-sheet.png`
- implementation screenshot path: `/private/tmp/ninka-brand-desktop-v2.png`
- viewport: `1280 × 800` CSS px，device scale factor `1`
- source dimensions: `1600 × 1200` px
- implementation dimensions: `1280 × 800` px
- density normalization: 全局比较按相同显示高度等比缩放；局部比较只放大侧栏品牌区用于检查，不以放大后的插值锐度作为缺陷依据
- state: 浏览器演示模式、原料库、侧栏展开；另验证侧栏折叠和 `900 × 760` 窄屏状态

## Full-view comparison evidence

- combined comparison: `/private/tmp/ninka-brand-full-comparison.png`
- 品牌图形、Forest/Grain/Tomato/Cream 四色与源资产一致。
- 36 px 图形位于 66 px 侧栏头部内，未压缩、拉伸或裁切；侧栏宽度为 168 px，页面无水平溢出。
- 中文产品名继续使用现有 UI 字体与层级；`Ninka FoodLab` 作为品牌归属说明，不冒充正式轮廓字标。

## Focused region comparison evidence

- combined comparison: `/private/tmp/ninka-brand-focused-comparison.png`
- 对比了资产表中的 16–64 px 深底图标与应用左上角品牌区。
- 应用直接引用已验证的深底彩色 SVG，没有使用 CSS 图形、近似绘制或替代图标。

## Required fidelity surfaces

- Fonts and typography: 中文应用名沿用现有系统 UI 字体；英文品牌名大小与字重低于产品名，层级清楚，无截断或异常换行。
- Spacing and layout rhythm: 图形为 `36 × 36` px，展开态间距 10 px；折叠态居中，侧栏由 168 px 收至 76 px，均无溢出。
- Colors and visual tokens: 图形使用源 SVG 精确色值；新增品牌令牌为 Forest `#153D36`、Grain `#EFBD50`、Tomato `#DF6B45`、Cream `#FFF7E7`。
- Image quality and asset fidelity: Web 端为 SVG；Tauri PNG、ICO、ICNS 与品牌源文件哈希一致，未发生拉伸或重新绘制。
- Copy and content: 保留中文产品名“食研工作台”，正式英文品牌名写作 `Ninka FoodLab`。

## Findings and comparison history

### Pass 1

- [P2] 浅底图标在浅灰侧栏上缺少完整轮廓。
  - evidence: `/private/tmp/ninka-brand-desktop.png`
  - impact: 图形只剩九个颗粒可见，与品牌资产表中数字场景默认的深底 App 图标识别度不一致。
  - fix: 将侧栏图形从 `ninka-symbol-color-light.svg` 改为数字场景默认的 `ninka-symbol-color-dark.svg`。

### Pass 2

- post-fix evidence: `/private/tmp/ninka-brand-desktop-v2.png`
- 展开侧栏、折叠侧栏 `/private/tmp/ninka-brand-collapsed.png` 和窄屏 `/private/tmp/ninka-brand-narrow.png` 均无 P0/P1/P2 问题。
- 折叠后文字隐藏但图形保留，实测侧栏宽度 76 px；900 px 窄屏自动使用图形态，页面无水平溢出。
- 浏览器控制台未发现 error 级日志。

## Implementation checklist

- [x] 侧栏使用正式品牌 SVG。
- [x] 折叠态与窄屏只显示独立图形。
- [x] Tauri 使用已验证的多平台图标。
- [x] 品牌令牌进入前端设计变量。
- [x] 侧栏组件测试、生产构建和品牌资产验证通过。

final result: passed

---

# Ninka FoodLab 图标 Batch 01 SVG 母版 QA

- source visual truth path: `/Users/andrew/.codex/generated_images/019f789f-aaf8-7aa2-a3c1-c3c440b9dc9e/exec-7539c9c5-8aa2-40d1-99ad-aaa4eca80217.png`
- implementation review path: `/Users/andrew/Documents/食品研发工具/assets/icons/ninka-foodlab/batch-01/review.png`
- SVG source directory: `/Users/andrew/Documents/食品研发工具/assets/icons/ninka-foodlab/batch-01`
- source dimensions: `1400 × 900` px
- review dimensions: `1400 × 1400` px；内容集中在顶部评审区，底部留白不参与对比
- state: SVG 独立评审稿，尚未锁版，未接入应用调用

## Full-view comparison evidence

- 五个语义与第二方向一致：原料库、原料、供应商、原料版本、配方库。
- 轮廓统一为 24px 网格、1.75px、圆角端点和圆角连接；主色 Forest `#153D36`，品牌强调 Grain `#EFBD50`。
- 原料库、原料版本和配方库使用同一套“四粒种子”签名；原料使用单粒 Grain；供应商保持纯 Forest，避免重复强调。

## Focused size evidence

- 评审板逐个展示 16px、20px、24px 三档。
- 16px 下主体轮廓未粘连，品牌种子仍可识别；20px 和 24px 下层级与语义稳定。
- 配方库的文件与文件夹保留前后层级，文件内两条信息线在 24px 下可辨。

## Reproducibility and validation

- 基础轮廓与种子单元来自 Tabler Icons `3.46.0`，生成脚本记录在 `build.mjs`。
- 五个 SVG 和评审板均通过 `xmllint --noout`。
- `manifest.json` 验证为 5 个图标、24px 网格、1.75px 描边。
- 本批未修改应用图标调用；现有应用中的临时实现保持原状，待用户确认后再替换。

## Findings

- 当前视觉检查未发现 P0/P1/P2 问题。
- 本轮状态仍为 `review`；用户确认后才改为 `approved` 并进入应用接入。

final result: ready for user review

---

# Ninka FoodLab 品牌化工具图标 QA

- source visual truth path: `/Users/andrew/.codex/generated_images/019f789f-aaf8-7aa2-a3c1-c3c440b9dc9e/exec-71cb84f2-9033-4b3d-bea7-7af08f1864e6.png`
- implementation screenshot paths:
  - `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/icon-system-qa-collapsed.png`
  - `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/icon-system-qa-data-management.png`
- focused evidence paths:
  - `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/icon-system-qa-collapsed-focus.png`
  - `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/icon-system-qa-data-management-focus.png`
- viewport: `1280 × 720` CSS px，device scale factor `1`
- source dimensions: `1448 × 1086` px
- implementation dimensions: `1280 × 720` px
- density normalization: 全局对比按各自完整画面检查；局部证据从原始 `1280 × 720` 截图裁切，导航图标放大 3 倍、数据管理区域放大 1.5 倍，仅用于检查轮廓、颗粒与裁切，不以插值锐度作为缺陷依据
- state: 浏览器演示模式；原料库侧栏展开/折叠、配方库空状态、Agent 面板、数据管理禁用态

## Full-view comparison evidence

- 24 px 网格、1.75 px 圆角描边、Forest 主色以及 Grain 点缀与选定图标板一致。
- 原料库、配方库、数据管理、AI、搜索、新建、设置与数据库状态在当前高密度桌面布局中保持熟悉的软件隐喻。
- 展开与折叠导航、Agent 面板、表格工具栏和设置页均无图标裁切或导致布局位移的问题。

## Focused region comparison evidence

- 折叠侧栏中的 `ingredient-library` 与 `recipe-library` 均保持 `20 × 20` px 可见轮廓；Grain 签名以单点形式出现，符合源图“低尺度使用单点或边角点缀”的规则。
- 数据管理中的 `offline`、`backup`、`restore` 分别以 19 px、17 px、17 px 呈现；禁用态仍能区分备份与恢复，不抢正文层级。
- 16–20 px 图标均未发现描边粘连；32 px 配方工作台空状态仍保持同一线宽语言。

## Required fidelity surfaces

- Fonts and typography: 未改变现有 UI 字体、按钮字号或文字层级；图标保持装饰性 `aria-hidden`，不污染按钮可访问名称。
- Spacing and layout rhythm: 图标外层固定为传入尺寸并 `flex: 0 0 auto`；按钮、导航和状态行间距保持原有节奏。
- Colors and visual tokens: 默认继承 `currentColor`；品牌签名使用 `--brand-grain`，交互、禁用与危险状态继续由现有 token 控制。
- Image quality and asset fidelity: 标准图标来自 Tabler 的 24 px 矢量图标库；品牌签名使用同库矢量符号，没有手绘 SVG、CSS 图形或位图缩放。
- Copy and content: 新增产品语义覆盖原料、供应商、配方、版本、营养、成本、目标、过敏原、研发备注、打样、报告、导入导出、备份恢复、离线、AI 与未知数据；界面文案未改写。

## Findings and comparison history

### Pass 1

- [P2] 折叠侧栏隐藏了导航图标。
  - evidence: 初次折叠检查中三个 `.ninka-icon` 的可见尺寸均为 `0 × 0`。
  - impact: 折叠后只剩选中背景，主导航无法识别。
  - fix: 为导航文字增加 `.nav-item__label`，将折叠规则从隐藏所有直接子 `span` 收窄为只隐藏文字标签，并增加回归测试。

### Pass 2

- post-fix evidence: `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/icon-system-qa-collapsed.png`
- 三个导航图标实测均为 `20 × 20` px 且可见；折叠、页面切换、Agent 开关与数据管理切换均通过。
- 浏览器控制台未发现 error 或 warning 日志。
- 无剩余 P0/P1/P2 问题。小尺寸签名收敛为 Grain 单点是源设计允许的克制表达，不列为缺陷。

## Implementation checklist

- [x] 统一 24 px / 1.75 px / 圆角描边体系。
- [x] 保留旧 IconName 兼容别名并新增食品研发语义名称。
- [x] 在数据、版本、AI 与聚合语义中加入克制的 Ninka 签名。
- [x] 高频导航、报告、配方、打样、备份恢复、导入导出与 Agent 入口完成接入。
- [x] 51 个高关联测试、TypeScript 类型检查和生产构建通过。
- [x] 折叠导航、禁用态、17–32 px 尺寸与浏览器控制台完成视觉验证。

final result: passed
