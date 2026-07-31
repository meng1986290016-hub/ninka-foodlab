# 第五阶段：中国营养标签、研发报告与备份恢复实施计划

> 执行要求：逐项使用测试驱动开发；规则计算必须保持确定性；每个正式输出必须能追溯到明确的配方版本、规则包版本和数据来源。涉及法规的结果只能表述为规则校验与风险提示，不替代企业最终合规审核。

**目标：** 在第四阶段正式配方版本之上，交付中国营养标签双标准预览、可审计研发报告、多格式输出，以及本地数据库与附件的备份恢复闭环。

**架构：**

- `@food-rd/core` 负责版本化营养标签规则包、能量与 NRV 计算、零界限、修约和确定性校验。
- React 负责标签工作台、规则选择、数据来源复核、问题提示和打印预览。
- Rust + SQLite 负责标签草稿、不可变发布快照、输出文件、备份清单、校验和及事务恢复。
- 浏览器演示与 Tauri 必须共享同一 camelCase 业务契约；浏览器演示只模拟下载和恢复预检，不伪装为真实文件系统备份。

## 标准依据与版本策略

官方依据：

- 国家卫生健康委 2025 年第 2 号公告：  
  <https://www.nhc.gov.cn/wjw/zcwjgg/202503/97802a2683b840dd8be0e1449982c6a5.shtml>
- GB 28050-2025 官方问答：  
  <https://www.nhc.gov.cn/sps/c100087/202509/470fa4ff5de14dd38619223cce9da4e7.shtml>
- GB 28050-2011 官方问答（修订版）：  
  <https://www.nhc.gov.cn/zwgk/zcjd/201402/6f68ec6692594cf28d190cb47b770c11.shtml>

版本策略：

- `GB 28050-2011` 保留为现行规则包，支持过渡期内的既有产品与历史标签。
- `GB 28050-2025` 作为可提前采用的规则包；自 2027-03-16 起成为默认新建规则包。
- 2011 版强制项目为能量、蛋白质、脂肪、碳水化合物和钠。
- 2025 版增加饱和脂肪和糖，并要求相应提示语。
- 用户必须在标签草稿中看到并确认所选标准；已经发布的标签快照永不自动迁移。
- 软件日期只影响新建草稿的推荐规则，不自动改写用户选择或历史数据。
- 未知营养值不得当作零；缺失强制项目时允许研发预览，但阻止“发布正式标签”。

## 范围约定

- 支持普通预包装食品营养成分表；特殊膳食、保健食品、婴幼儿食品和特医食品暂不纳入自动判定。
- 标签值可来自配方估算、检测结果或人工确认值，每一项均保留来源与更新时间。
- 本阶段不自动生成营养声称、功能声称或“高/低/无”结论。
- 本阶段不覆盖完整 GB 7718 配料表、净含量、日期、贮存条件等包装合规审查。
- 首批输出格式为 SVG、PNG、PDF、XLSX 和 JSON。
- 备份为本地离线文件，不自动上传云端；API Key 和系统钥匙串秘密不写入备份。

---

## 5A：中国营养标签

### Task 1：定义版本化标签规则与快照公共契约

**前端可见性：** 不可见。

**Files:**

- Create: `packages/core/src/nutrition-label.ts`
- Create: `packages/core/test/nutrition-label.test.ts`
- Modify: `packages/core/src/index.ts`

**Requirements:**

- 定义 `gb-28050-2011` 与 `gb-28050-2025` 两个稳定规则包 ID。
- 规则包包含标准号、修订号、发布日期、实施日期、官方来源和强制项目顺序。
- 标签输入明确区分配方估算、检测结果和人工确认值。
- 标签快照固定配方版本、规则包、计算输入、输出行、问题列表和生成时间。
- 保持未知值 `null` 与已确认零值 `"0"` 的区别。

- [x] **Step 1:** 先写规则包、序列化和未知/零值测试。
- [x] **Step 2:** 建立公共契约并导出。
- [x] **Step 3:** 运行 core 类型检查和测试。
- [x] **Step 4:** 提交 `feat(labels): define versioned nutrition label contract`。

### Task 2：实现双标准规则包与日期推荐策略

**前端可见性：** 不可见。

**Files:**

- Create: `packages/core/src/nutrition-label-rules.ts`
- Create: `packages/core/test/nutrition-label-rules.test.ts`
- Modify: `packages/core/src/index.ts`

**Requirements:**

- 固定 2011 与 2025 强制项目、显示顺序、表达单位和 NRV 元数据。
- 2027-03-16 前推荐 2011 版，同时允许明确提前采用 2025 版。
- 2027-03-16 起新建标签默认推荐 2025 版。
- 日期判断使用显式 `YYYY-MM-DD`，不依赖设备时区午夜副作用。
- 规则包内容只允许新增修订，不允许原地修改已发布修订。

- [x] **Step 1:** 写实施日前、实施日和实施日后的金样测试。
- [x] **Step 2:** 实现规则包注册表与推荐函数。
- [x] **Step 3:** 验证旧规则包始终可按 ID 读取。
- [x] **Step 4:** 提交 `feat(labels): add GB 28050 dual rule packs`。

### Task 3：实现标签值、能量、NRV、零界限与修约引擎

**前端可见性：** 不可见。

**Files:**

- Create: `packages/core/src/nutrition-label-calculator.ts`
- Create: `packages/core/test/nutrition-label-calculator.test.ts`
- Modify: `packages/core/src/index.ts`

**Requirements:**

- 使用 `decimal.js` 完成全程十进制计算。
- 支持每 100g、每 100mL 与每份表达；每份仍需按标准校验 100g/100mL 零界限。
- 根据规则包计算 NRV%，未规定 NRV 的项目输出空值而非虚构百分比。
- 同一标签统一采用已选修约策略。
- 缺少强制项目、单位不匹配或完整度不足时产生结构化问题并阻止正式发布。
- 配方估算值与检测/人工值分层保存，不覆盖原始计算结果。

- [x] **Step 1:** 写 2011、2025、未知、零值、边界值和单位错误测试。
- [x] **Step 2:** 实现确定性标签计算。
- [x] **Step 3:** 写重复运行字节级一致性测试。
- [x] **Step 4:** 提交 `feat(labels): calculate China nutrition labels`。

### Task 4：建立法规金样夹具与差异回归

**前端可见性：** 不可见。

**Files:**

- Create: `packages/core/test/fixtures/nutrition-labels/*.json`
- Create: `packages/core/test/nutrition-label-golden.test.ts`
- Create: `docs/regulatory/gb-28050-rule-ledger.md`

**Requirements:**

- 覆盖固体、液体、按份、未知必填项、确认零值和临界修约。
- 同一输入分别生成 2011 与 2025 输出，明确新增项目与提示语。
- 每条实现规则记录标准来源、解释、测试夹具和代码位置。
- 金样更新必须显式审阅，禁止测试自动重写预期结果。

- [x] **Step 1:** 建立首批官方示例与自有边界夹具。
- [x] **Step 2:** 建立规则台账。
- [x] **Step 3:** 验证双标准差异。
- [x] **Step 4:** 提交 `test(labels): add GB 28050 golden fixtures`。

### Task 5：持久化标签草稿与不可变发布快照

**前端可见性：** 不可见。

**Files:**

- Create: `apps/desktop/src-tauri/migrations/0006_nutrition_labels.sql`
- Create: `apps/desktop/src-tauri/src/labels/{mod.rs,model.rs,repository.rs}`
- Create: `apps/desktop/src-tauri/tests/label_repository.rs`
- Modify: `apps/desktop/src-tauri/src/lib.rs`
- Modify: `apps/desktop/src-tauri/src/database/migrations.rs`

**Requirements:**

- 标签草稿引用明确配方版本，并可反复修改。
- 正式发布快照不可变，固定规则包修订、来源值、输出值和问题处理记录。
- 被报告引用的标签版本不可删除。
- 事务失败不得消耗正式版本号。
- 重启后草稿、正式标签和来源关系保持一致。

- [x] **Step 1:** 先写迁移、不可变、事务和重启测试。
- [x] **Step 2:** 实现仓储与数据库约束。
- [x] **Step 3:** 运行全部 Rust 仓储测试。
- [x] **Step 4:** 提交 `feat(labels): persist immutable label versions`。

### Task 6：补齐 DesktopApi、Tauri 命令和浏览器演示契约

**前端可见性：** 暂不可见。

**Files:**

- Create: `apps/desktop/src/api/nutrition-label-types.ts`
- Create: `apps/desktop/src/api/nutrition-label-api.test.ts`
- Create: `apps/desktop/src-tauri/src/commands/labels.rs`
- Modify: `apps/desktop/src/api/desktop-api.ts`
- Modify: `apps/desktop/src/api/tauri-desktop-api.ts`
- Modify: `apps/desktop/src/api/browser-demo-api.ts`
- Modify: `apps/desktop/src/api/browser-schema.ts`
- Modify: `apps/desktop/src-tauri/src/commands/mod.rs`

**Requirements:**

- 提供创建草稿、更新来源值、计算预览、发布正式标签和读取历史版本接口。
- 浏览器演示数据升级为下一 schema 版本并保留旧数据迁移。
- Tauri 与浏览器返回相同 JSON 形状和错误码。
- API 不接受客户端伪造的正式计算结果；正式发布必须在受信任路径重新计算。

- [x] **Step 1:** 写双适配器契约测试。
- [x] **Step 2:** 实现命令与浏览器持久化。
- [x] **Step 3:** 验证未知/零值和规则包修订往返。
- [x] **Step 4:** 提交 `feat(labels): expose nutrition label desktop api`。

### Task 7：设计并实现营养标签工作台

**前端可见性：** 可测试。

**Files:**

- Create: `docs/design/phase-5-nutrition-labels/{SPEC.md,PROMPTS.md}`
- Create: `apps/desktop/src/features/labels/*`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/Icon.tsx`
- Modify: `apps/desktop/src/styles/app.css`
- Modify: `apps/desktop/src/features/recipes/RecipeLibrary.tsx`

**Requirements:**

- 可从正式配方版本进入“生成营养标签”；草稿只能做研发预览。
- 页面明确显示标准版本、实施状态、配方版本和生成依据。
- 逐项显示配方估算、检测/人工覆盖值、最终标示值和来源。
- 缺失强制项目时突出显示并说明为什么不能发布。
- 同屏展示营养成分表预览、NRV%、修约前后值和问题列表。
- 支持桌面并排、窄屏上下和手机单列。

- [x] **Step 1:** 先完成信息架构和高保真设计。
- [x] **Step 2:** 写导航、规则选择、来源复核和发布保护测试。
- [x] **Step 3:** 实现工作台和配方库入口。
- [x] **Step 4:** 完成真实浏览器三尺寸验收。
- [x] **Step 5:** 提交 `feat(labels): add nutrition label workspace`。

---

## 5B：研发报告与多格式输出

### Task 8：建立统一报告文档模型与 SVG 预览

**前端可见性：** 可测试。

**Requirements:**

- 报告模型包含配方摘要、原料及供应商、营养、成本、目标、过敏原、备注和标签规则来源。
- 所有格式从同一不可变报告模型生成，避免各格式数值不一致。
- SVG 使用本地字体回退与确定性布局，不加载远程资源。
- 报告标注“配方估算”“检测值”或“人工确认值”。

- [x] **Step 1:** 写报告模型和 SVG 金样测试。
- [x] **Step 2:** 实现打印预览和保存记录。
- [x] **Step 3:** 提交 `feat(reports): add deterministic R&D report model`。

### Task 9：实现 PNG、PDF、XLSX 与 JSON 输出

**前端可见性：** 可测试。

**Requirements:**

- PNG/PDF 与 SVG 预览保持相同标签值和版式顺序。
- XLSX 包含配方、原料、营养、成本、目标、标签与来源工作表。
- JSON 包含 schemaVersion、规则包、快照哈希和完整业务数据。
- 输出到临时文件后原子替换目标文件，失败不留下损坏文件。
- 文件名安全，公式字符串防注入，不泄露本机绝对路径。

- [ ] **Step 1:** 写各格式解析回读测试。
- [ ] **Step 2:** 实现 Tauri 文件导出与浏览器下载模拟。
- [ ] **Step 3:** 比对所有格式的关键字段一致性。
- [ ] **Step 4:** 提交 `feat(reports): export label and R&D reports`。

---

## 5C：备份、恢复与升级保护

### Task 10：设计离线备份包、清单与校验和

**前端可见性：** 暂不可见。

**Requirements:**

- 备份包含 SQLite 一致性快照、附件、manifest、schemaVersion 和 SHA-256。
- API Key、钥匙串秘密、临时文件和缓存不进入备份。
- 使用临时目录生成完整包后再原子移动。
- 中断或空间不足时不破坏当前数据库。

- [ ] **Step 1:** 写包结构、秘密排除和损坏检测测试。
- [ ] **Step 2:** 实现 `.foodrd-backup` 本地备份包。
- [ ] **Step 3:** 提交 `feat(backup): create verified offline backups`。

### Task 11：实现恢复预检、迁移与原子回滚

**前端可见性：** 暂不可见。

**Requirements:**

- 恢复前验证清单、校验和、数据库完整性和 schema 兼容范围。
- 显示将恢复的数据量、附件量、备份时间和版本。
- 恢复前自动创建当前状态安全副本。
- 任一步失败均回滚到恢复前状态。
- 支持从当前已发布历史 schema 升级，不支持静默降级覆盖。

- [ ] **Step 1:** 写成功、损坏、旧版升级和失败回滚测试。
- [ ] **Step 2:** 实现恢复协调器。
- [ ] **Step 3:** 完成真实文件数据库重启测试。
- [ ] **Step 4:** 提交 `feat(backup): restore with atomic rollback`。

### Task 12：实现数据管理界面与阶段验收

**前端可见性：** 可测试。

**Requirements:**

- 设置中提供“创建备份”“检查备份”“恢复备份”。
- 恢复前展示不可跳过的影响确认，恢复后自动重启数据连接。
- 完成“正式配方 → 双标准标签 → 发布 → 多格式报告 → 备份 → 清空测试库 → 恢复”的完整闭环。
- 编写人工验收清单、升级说明和开源数据安全说明。

- [ ] **Step 1:** 写数据管理界面和完整恢复闭环测试。
- [ ] **Step 2:** 实现界面与状态反馈。
- [ ] **Step 3:** 运行 core、前端、Rust 全量回归和真实浏览器验收。
- [ ] **Step 4:** 更新 README、路线图与验收文档。
- [ ] **Step 5:** 提交 `test(phase5): verify labels reports and recovery`。

## 完成定义

- 双标准规则包有官方来源、规则台账和金样测试。
- 所有正式标签固定配方版本与规则包修订，缺失必填数据时无法发布。
- SVG、PNG、PDF、XLSX、JSON 的关键数值一致且可回读验证。
- 备份不含秘密，可验证、可预检、可回滚，并通过真实文件数据库恢复测试。
- 浏览器演示与 Tauri 契约一致；浏览器不会宣称完成真实本机备份。
- 所有自动测试、生产构建、Rust 严格检查和人工验收均通过。
