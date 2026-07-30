# 第四阶段：配方工作台与配方库实施计划

> 执行要求：逐项使用测试驱动开发；每个任务都必须形成可独立验收的提交。底层任务明确注明“前端不可见”，进入界面任务后再提供本机预览。

**目标：** 交付从选择具体供应商原料版本、设计和计算配方，到保存不可变版本、引用半成品、搜索与比较版本的完整食品研发闭环。

**架构：** `@food-rd/core` 继续作为唯一确定性计算引擎。React 负责工作台状态与实时结果展示；Rust + SQLite 负责草稿、配方元数据、不可变版本快照、引用约束和事务。正式版本冻结原料营养、价格、过敏原、规则输入和计算结果；历史版本不会被原料库后续修改影响。

**范围约定：**

- 配方必须引用具体供应商原料版本。
- 半成品必须引用明确的正式配方版本，不浮动跟随最新版。
- 支持 mg、g、kg、mL、L；体积换算缺少密度时阻止计算和保存。
- 支持锁定、按比例调整、指定原料补足至目标批量或 100%。
- 支持目标批量、实际成品重量、营养与成本目标、包材成本、其他成本、过敏原和一个 Markdown 备注框。
- 草稿自动保存；正式版本不可原地修改。
- 配方编号与标签为可选字段，不要求个人用户维护。
- 本阶段不包含法规标签、PDF/图片报告和备份恢复，它们属于第五阶段。

---

## Task 1：定义配方、草稿、版本和计算快照公共契约

**前端可见性：** 不可见。

**Files:**

- Create: `apps/desktop/src/api/recipe-types.ts`
- Create: `apps/desktop/src/api/recipe-types.test.ts`
- Modify: `docs/superpowers/plans/2026-07-15-food-rd-roadmap.md`

**Interfaces:**

- 配方元数据、草稿项目、供应商原料引用、半成品版本引用。
- 配方目标、包材成本、其他成本、实时计算结果。
- 不可变版本快照、版本摘要和差异比较结果。
- 明确区分未知营养 `null` 与已确认零值 `"0"`。

- [x] **Step 1:** 写契约测试并确认类型不存在。
- [x] **Step 2:** 建立稳定 camelCase TypeScript 数据契约。
- [x] **Step 3:** 验证未知值、零值、可选编号和明确版本引用。
- [x] **Step 4:** 运行前端类型检查与契约测试。
- [x] **Step 5:** 提交 `feat(recipes): define recipe workspace contract`。

---

## Task 2：建立 SQLite 配方草稿与不可变版本存储

**前端可见性：** 不可见。

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0005_recipe_workspace.sql`
- Create: `apps/desktop/src-tauri/src/recipes/model.rs`
- Create: `apps/desktop/src-tauri/src/recipes/repository.rs`
- Create: `apps/desktop/src-tauri/tests/recipe_repository.rs`
- Modify: `apps/desktop/src-tauri/src/database/migrations.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Requirements:**

- 配方元数据与当前草稿可修改。
- 正式版本快照创建后不可更新。
- 版本依赖单独记录，用于半成品引用和归档保护。
- 保存正式版本必须在一个事务中完成快照、计算结果、依赖和版本号写入。
- 重启后恢复草稿；中断写入不产生半个版本。

- [x] **Step 1:** 写迁移、重启恢复、不可变和事务回滚测试。
- [x] **Step 2:** 建立 schema version 5 与外键/唯一约束。
- [x] **Step 3:** 实现草稿读写和正式版本事务。
- [x] **Step 4:** 实现版本引用保护与归档。
- [x] **Step 5:** 运行 Rust 存储测试。
- [x] **Step 6:** 提交 `feat(recipes): persist drafts and immutable versions`。

---

## Task 3：补齐 DesktopApi、Tauri 命令和浏览器演示持久化

**前端可见性：** 不可见。

**Files:**

- Modify: `apps/desktop/src/api/desktop-api.ts`
- Modify: `apps/desktop/src/api/tauri-desktop-api.ts`
- Modify: `apps/desktop/src/api/browser-demo-api.ts`
- Modify: `apps/desktop/src/api/browser-schema.ts`
- Create: `apps/desktop/src-tauri/src/commands/recipes.rs`
- Create: `apps/desktop/src/api/recipe-api.test.ts`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`

**Requirements:**

- 原生端与浏览器演示使用相同请求/响应结构。
- 提供配方元数据、草稿、版本、复制、归档和比较命令。
- 所有时间和版本号由服务端生成。
- 结构化错误不暴露 SQL、本机路径或快照全文。

- [x] **Step 1:** 写 DesktopApi 和命令映射失败测试。
- [x] **Step 2:** 实现 Tauri 命令与 camelCase 序列化。
- [x] **Step 3:** 将浏览器 schema 升级到 v5 并保留旧数据。
- [x] **Step 4:** 运行 API、浏览器迁移和 Rust 命令测试。
- [x] **Step 5:** 提交 `feat(recipes): expose recipe desktop api`。

---

## Task 4：建立原料快照和确定性配方计算适配层

**前端可见性：** 不可见。

**Files:**

- Create: `apps/desktop/src/features/recipes/recipe-calculation.ts`
- Create: `apps/desktop/src/features/recipes/recipe-calculation.test.ts`
- Modify: `apps/desktop/package.json`
- Modify: `pnpm-lock.yaml`

**Requirements:**

- 把供应商原料版本转换为 `@food-rd/core` 的质量、营养和价格输入。
- 价格统一转换为每 kg；营养统一转换为每 100g。
- mL/L 只有在密度存在时换算。
- 半成品逐层展开并检查循环引用。
- 计算整批、每 kg、每 100g、每份、每包装成本和营养完整度。
- 汇总“含有/可能含有”过敏原与缺失数据。

- [x] **Step 1:** 写质量/体积、未知值、供应商价格和多层半成品测试。
- [x] **Step 2:** 添加 workspace core 依赖并实现适配器。
- [x] **Step 3:** 验证计算结果与 core 端到端金样一致。
- [x] **Step 4:** 提交 `feat(recipes): adapt ingredient snapshots to core`。

---

## Task 5：建立配方草稿服务和自动保存

**前端可见性：** 仅能通过测试验证，尚无正式页面。

**Files:**

- Create: `apps/desktop/src/features/recipes/useRecipeDraft.ts`
- Create: `apps/desktop/src/features/recipes/useRecipeDraft.test.tsx`
- Create: `apps/desktop/src/features/recipes/recipe-draft-state.ts`

**Requirements:**

- 新建、恢复、编辑和清空草稿。
- 输入金额/用量时保留用户文本，只有合法值进入计算。
- 计算错误不会覆盖最后一次有效结果。
- 自动保存防抖；退出或重启后恢复。
- 正式版本复制为新草稿，并保留来源版本 ID。

- [ ] **Step 1:** 写恢复、防抖、无效输入和复制草稿测试。
- [ ] **Step 2:** 实现 reducer 与草稿 hook。
- [ ] **Step 3:** 验证崩溃恢复和并发保存顺序。
- [ ] **Step 4:** 提交 `feat(recipes): autosave recipe drafts`。

---

## Task 6：设计配方工作台完整主界面

**前端可见性：** 设计稿可见，尚未编码。

**Files:**

- Create: `docs/design/phase-4-recipe-workbench/`

**Requirements:**

- 延续现有应用的白色/浅灰/绿色设计系统和左侧导航。
- 完整展示原料行、用量/百分比、锁定、补足、批量、实时营养成本、目标、过敏原和备注。
- 另生成窄屏状态和原料选择状态，确保控件文字可读。
- 不增加与当前产品无关的仪表盘、指标卡或营销元素。

- [ ] **Step 1:** 用 Image Gen 生成完整工作台和关键状态概念。
- [ ] **Step 2:** 用 `view_image` 检查文字、密度和组件细节。
- [ ] **Step 3:** 提取设计 token、组件和响应式规则。
- [ ] **Step 4:** 提交已确认的设计规格。

---

## Task 7：实现工作台基础页面和原料选择

**前端可见性：** 可在浏览器演示版测试。

**Files:**

- Create: `apps/desktop/src/features/recipes/RecipeWorkbench.tsx`
- Create: `apps/desktop/src/features/recipes/RecipeHeader.tsx`
- Create: `apps/desktop/src/features/recipes/RecipeItemTable.tsx`
- Create: `apps/desktop/src/features/recipes/RecipeIngredientPicker.tsx`
- Create: `apps/desktop/src/features/recipes/RecipeWorkbench.test.tsx`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/styles/app.css`

**Requirements:**

- 配方工作台导航不再显示占位页。
- 添加具体供应商原料版本或明确半成品版本。
- 行内编辑用量和单位、删除、排序、锁定。
- 显示原料通用名、供应商、型号/规格和数据完整度。
- 草稿状态与保存状态清晰可见。

- [ ] **Step 1:** 写完整添加/编辑/删除流程测试。
- [ ] **Step 2:** 按设计规格实现桌面工作台。
- [ ] **Step 3:** 实现窄屏布局与键盘可达性。
- [ ] **Step 4:** 使用 Browser/IAB 和截图逐项比对设计稿。
- [ ] **Step 5:** 提交 `feat(recipes): add recipe workbench`。

---

## Task 8：实现批量缩放、锁定和自动补足

**前端可见性：** 可测试。

**Requirements:**

- 用量与百分比双向联动。
- 修改目标批量时可选择按比例缩放。
- 锁定项保持不变，未锁定项按比例调整。
- 任意一个未锁定项可设为补足项。
- 负数、锁定总量超限、补足项锁定和零基数给出具体提示。

- [ ] **Step 1:** 写交互与 core 一致性测试。
- [ ] **Step 2:** 实现缩放、锁定和补足命令。
- [ ] **Step 3:** 验证边界错误不会破坏草稿。
- [ ] **Step 4:** 提交 `feat(recipes): rebalance locked formula items`。

---

## Task 9：实现实时营养、成本、目标、过敏原和备注

**前端可见性：** 可测试。

**Requirements:**

- 实时显示整批和每 100g 营养、成本构成、得率和数据完整度。
- 支持营养目标、整批/每 kg/每 100g 成本目标。
- 支持包材和自由其他成本项。
- 醒目汇总两类过敏原。
- 只有一个 Markdown 研发备注框。
- 计算失败与缺失数据定位到具体原料行。

- [ ] **Step 1:** 写实时结果、目标、成本和过敏原测试。
- [ ] **Step 2:** 实现结果侧栏和目标编辑。
- [ ] **Step 3:** 实现包材/其他成本和备注。
- [ ] **Step 4:** 完成浏览器视觉与交互验收。
- [ ] **Step 5:** 提交 `feat(recipes): show live nutrition and cost`。

---

## Task 10：保存正式版本、半成品引用和循环保护

**前端可见性：** 可测试。

**Requirements:**

- 保存前验证配方名称、项目、单位、密度、目标批量、引用和计算结果。
- 正式版本冻结原料与半成品快照、营养、价格、成本、过敏原、目标和备注。
- 半成品只能选择正式版本。
- 检测直接和间接循环引用。
- 正式版本修改时必须复制为新草稿。

- [ ] **Step 1:** 写人工保存、快照不变和循环引用测试。
- [ ] **Step 2:** 实现保存前预览与确认。
- [ ] **Step 3:** 实现半成品版本选择与升级操作。
- [ ] **Step 4:** 验证原料价格更新不改变历史版本。
- [ ] **Step 5:** 提交 `feat(recipes): save immutable recipe versions`。

---

## Task 11：实现配方库、版本详情和搜索

**前端可见性：** 可测试。

**Requirements:**

- 按名称、可选编号、可选标签、类型、状态和更新时间搜索筛选。
- 列出版本号、批量、成本、更新时间和引用状态。
- 查看冻结快照与“按当前价格临时重算”。
- 支持复制为草稿和归档；被引用版本不可删除。

- [ ] **Step 1:** 写搜索、详情、复制、归档和引用保护测试。
- [ ] **Step 2:** 实现配方库与版本详情。
- [ ] **Step 3:** 实现按当前价格临时重算，不覆盖快照。
- [ ] **Step 4:** 提交 `feat(recipes): add recipe library`。

---

## Task 12：实现版本比较与阶段验收

**前端可见性：** 可测试。

**Requirements:**

- 比较原料增删、供应商变化、用量、营养、成本、目标、过敏原和备注。
- 完成“选择原料 → 调配 → 锁定补足 → 设置目标 → 保存版本 → 复制修改 → 比较”的端到端流程。
- 重启后草稿、版本和半成品引用保持一致。
- 浏览器演示和 Tauri 使用相同业务契约。

- [ ] **Step 1:** 写版本差异和完整研发闭环测试。
- [ ] **Step 2:** 实现比较界面。
- [ ] **Step 3:** 完成全量前端/Rust/core 回归。
- [ ] **Step 4:** 编写第四阶段人工验收清单与 README。
- [ ] **Step 5:** 提交 `test(recipes): verify recipe R&D workflow`。
