# Ninka FoodLab 顶部操作区与 Agent 覆盖层响应式 QA

- reported issue paths:
  - `/private/var/folders/m6/jrlh0fwd1wgg3kd1qj8313m00000gp/T/codex-clipboard-43fd2f3c-e67b-4cdf-b9f4-d49cbfe875c3.png`
  - `/private/var/folders/m6/jrlh0fwd1wgg3kd1qj8313m00000gp/T/codex-clipboard-bc0f8ddf-d370-4ce2-a878-b23f85678abc.png`
  - `/private/var/folders/m6/jrlh0fwd1wgg3kd1qj8313m00000gp/T/codex-clipboard-7cf9ba58-48ff-4030-81f8-0c68f2d96a02.png`
  - `/private/var/folders/m6/jrlh0fwd1wgg3kd1qj8313m00000gp/T/codex-clipboard-9b6d52d5-1f20-4c6f-9ae5-b640dcbbe088.png`
  - `/private/var/folders/m6/jrlh0fwd1wgg3kd1qj8313m00000gp/T/codex-clipboard-6a005391-3afa-4065-82ae-f86ebb37b18d.png`
- recipe library overlay screenshot: `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/agent-overlay-qa-recipe-library.jpg`
- workbench overlay screenshot: `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/agent-overlay-qa-workbench.jpg`
- narrow overlay screenshot: `/Users/andrew/Documents/食品研发工具/docs/testing/screenshots/agent-overlay-qa-narrow.jpg`
- viewport: 主验收 `1280 × 800` CSS px；极窄状态 `600 × 800` CSS px
- implementation dimensions: 主验收截图 `1600 × 1000` px；极窄截图 `750 × 1000` px；布局尺寸均以页面 CSS px 实测
- state: 浏览器演示模式；原料新建层、配方版本详情、配方工作台实时结果和 Agent 开启状态

## Findings and fixes

- root cause 1: 操作按钮允许 CJK 字符间换行，空间不足时会出现逐字竖排。
  - fix: 操作按钮统一 `white-space: nowrap` 与 `word-break: keep-all`，不设置全局固定宽度。
- root cause 2: 原料库、配方库和工作台只按窗口宽度响应，不能准确反映当前内容容器宽度。
  - fix: 三个工作区使用 container query；空间不足时重排信息层级，工作台极窄状态把 Agent 与打样收入“更多”。
- root cause 3: Agent 原来是 AppShell 网格的第三列，打开时会压缩下层内容，并触发侧栏、表格和按钮的额外响应式变化。
  - fix: Agent 改为绝对定位的右侧覆盖抽屉；AppShell 和下层页面不再根据 Agent 开关修改网格或侧栏状态。

## Measured layout evidence

- `1280 × 800` 下，Agent 开启前后侧栏均为 `168 px`，主内容均为 `1112 px`；用户手动侧栏状态保持不变。
- 配方库版本详情保持 `396.8 px` 宽、`x = 883.2 px`；其操作按钮在 Agent 开启前后坐标逐项一致，Agent 以 `400 px` 宽覆盖在右侧。
- 配方工作台头部保持 `1112 × 124 px`，编辑区保持 `772 px` 宽，实时结果保持 `340 px` 宽；Agent 开启前后几何位置一致。
- `600 × 800` 下，Agent 使用 `600 px` 全屏覆盖；下层工作台尺寸和位置不变，关闭后原位恢复。
- Agent 覆盖层为 `position: absolute`、`z-index: 60`，不会再触发下层 container query 或表格字段隐藏规则。

## Interaction and accessibility

- “更多”触发器暴露 `aria-haspopup="menu"`、`aria-controls` 和实时 `aria-expanded`；Escape 关闭后焦点返回触发按钮，点击外部也会关闭。
- 空配方的“我要打样”仍为禁用；加入原料后，Agent 与打样调用原有回调并自动关闭菜单。
- Agent 开关的 `aria-expanded` 保留；关闭覆盖层后，主内容可见且用户此前的手动侧栏状态不变。

## Verification

- 内置浏览器页面标题为 `Ninka FoodLab`，DOM 有实际业务内容，无框架错误覆盖层，控制台无 error 或 warning。
- Vitest：51 个测试文件、202 项测试全部通过。
- TypeScript 类型检查、Vite 生产构建和 `git diff --check` 通过；构建仅保留项目既有的大分块提示。

final result: passed

---

# Ninka FoodLab Agent 思考状态 QA

- source visual truth path: `/private/var/folders/m6/jrlh0fwd1wgg3kd1qj8313m00000gp/T/codex-clipboard-2ac347eb-7a1e-4e39-bd69-51c20c20ef5d.png`
- reported missing-state path: `/private/var/folders/m6/jrlh0fwd1wgg3kd1qj8313m00000gp/T/codex-clipboard-efe8d64a-7b31-41ac-99ea-fcf7bc400f5a.png`
- animation reference: `https://github.com/Jakubantalik/thinking-orbs`，官方 `working` / `20 px` 内联预设
- implementation screenshot path: `/private/tmp/ninka-thinking-final-desktop.png`
- live send-flow screenshot path: `/private/tmp/ninka-thinking-live-flow.png`
- responsive screenshot path: `/private/tmp/ninka-thinking-final-mobile.png`
- combined focused comparison: `/private/tmp/ninka-thinking-final-comparison.png`
- viewport: 桌面 `900 × 760` CSS px；窄屏检查触发 `≤620 px` 断点，内置浏览器实际 `innerWidth = 487 px`
- source dimensions: `752 × 236` px
- implementation dimensions: 桌面 `1125 × 950` px，浏览器密度约 `1.25`；Agent 面板 `420 × 620` CSS px
- state: 最新用户消息已进入时间线、模型尚未输出首段正文、状态为“正在思考”

## Full-view comparison evidence

- 思考状态已从输入框上方的独立整宽卡片移动到最新用户消息之后，成为对话时间线的一部分。
- 桌面面板保持 `420 px` 宽；窄屏断点下无水平溢出，思考行仍为 `80 × 20 px`。
- 输入框、用户消息、Agent 标题和模型状态未因新动效发生位移或遮挡。

## Focused region comparison evidence

- 组合图上半部为旧版，使用淡绿背景、边框和单个脉冲圆点；下半部为实现，使用官方 20 px 点阵轨道球与同一条“正在思考”文案。
- 新思考行实测背景透明、无边框、总高 `20 px`，文案为 `13 px / 620`，视觉层级明显低于用户消息、但仍可读。
- 两张间隔 `350 ms` 的浏览器截图哈希不同；页面没有其他动画，证明 Canvas 思考球正在更新帧。

## Required fidelity surfaces

- Fonts and typography: 沿用现有系统 UI 字体；13 px 状态文案与消息正文比例协调，无换行或截断。
- Spacing and layout rhythm: 20 px 动效与 8 px 间距形成一行；移除旧状态卡的内边距、背景和边框，减少输入区上方的视觉重量。
- Colors and visual tokens: 继续使用应用浅色表面与正文墨色；思考球固定 `theme="light"`，避免操作系统深色偏好造成浅底不可见。
- Image quality and asset fidelity: 直接使用 `thinking-orbs@0.2.0` 的 Canvas 点阵轨道动画，没有用 CSS 图形或近似重绘替代。
- Copy and content: 保留“正在思考”及现有工具阶段文案；错误、停止、完成和重试文案不变。

## Findings and comparison history

### Pass 1

- [P3] 额外的 `opacity: 0.86` 让 20 px 点阵在浅色面板上偏淡。
  - fix: 移除额外透明度，使用官方组件原始点阵明暗。

### Pass 2

- post-fix evidence: `/private/tmp/ninka-thinking-final-desktop.png`
- 桌面与窄屏均无 P0/P1/P2 问题；最终浏览器控制台无 error 或 warning。

### Pass 3 — 真实发送链路补测

- [P1] 浏览器离线演示模型同步写入回复并直接返回 `completed`，界面没有进入可渲染的运行态；静态预览可见，但真实发送时思考动效不会出现。
  - root cause: 思考行只依赖 `currentRun`；演示 API 在同一轮调用内依次发出正文与完成事件，`currentRun` 始终为 `null`。
  - fix: 将“请求正在启动”与“任务运行中”拆开；浏览器演示 API 先保存用户消息并返回 `running`，保留 `900 ms` 的真实运行窗口，再发送演示回复和完成事件。
  - post-fix evidence: `/private/tmp/ninka-thinking-live-flow.png`；用户消息之后显示 1 条“正在思考”，间隔 `250 ms` 的两帧哈希不同，完成后思考行数量归零、回复出现。

## Verification

- 页面身份、非空内容、框架错误覆盖层、控制台和运行中状态均通过内置浏览器检查。
- 交互检查：真实点击发送后，用户消息、思考行、演示回复按顺序出现；完成后思考行退出。
- Vitest：51 个测试文件、198 项测试在双 worker 完整回归中全部通过。
- TypeScript 类型检查和 Vite 生产构建通过；仅保留项目既有的大分块提示。
- `thinking-orbs` 的 MIT 许可已进入 `NOTICE` 和生成的 `THIRD_PARTY_LICENSES.md`。

final result: passed

---

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
