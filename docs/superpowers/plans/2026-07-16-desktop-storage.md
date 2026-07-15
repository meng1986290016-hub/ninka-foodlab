# 第二阶段：桌面外壳与本地数据实施计划

> 执行要求：按任务逐项使用测试驱动开发；每个任务先看到目标测试失败，再写最小实现并看到测试通过。完成批次后使用 `superpowers:verification-before-completion` 做全量复验。

**目标：** 交付可在 macOS 与 Windows 构建的 React + Tauri 2 桌面应用，具备 SQLite 显式迁移、原料基础信息增删改查、事务保护、编辑草稿恢复、本地设置和数据库备份恢复基础能力。

**架构：** 新增 `apps/desktop` 工作区。React/Vite 只负责界面和交互，通过 `DesktopApi` 接口访问数据；Tauri 适配器用命令调用 Rust。Rust 使用 `rusqlite` 与 bundled SQLite 管理连接、迁移、事务和文件恢复，数据库细节不暴露给前端。浏览器开发环境使用明确标记的内存适配器，便于无桌面窗口测试，但正式 Tauri 构建始终使用 SQLite。

**技术栈：** React、TypeScript、Vite、Vitest、Testing Library、Tauri 2、Rust、rusqlite、serde、uuid、tempfile。

---

## 前置条件与统一约定

- Node.js 与 pnpm 沿用仓库现有锁定版本。
- 本机已具备 Xcode Command Line Tools，但尚未安装 Rust；执行第一项任务时安装 stable Rust 工具链。
- 所有业务 ID 使用 UUID 字符串；时间通过 Rust 生成 UTC RFC 3339 字符串。
- 金额、密度等需要精确计算的值在 SQLite 中用十进制字符串保存，不使用浮点列。
- 删除原料在本阶段实现为软删除（写入 `archived_at`），避免未来配方引用出现悬空数据；列表默认不返回已归档数据。
- SQLite 每次连接启用 `foreign_keys`、`WAL` 与 `busy_timeout`。
- 写操作必须使用事务；迁移前先对已有数据库创建可恢复副本。

## Task 1：建立第二阶段隔离工作区与工具链

**文件：**

- 修改：`.gitignore`
- 修改：`package.json`
- 修改：`pnpm-workspace.yaml`
- 新增：`apps/desktop/package.json`
- 新增：`apps/desktop/index.html`
- 新增：`apps/desktop/tsconfig.json`
- 新增：`apps/desktop/tsconfig.node.json`
- 新增：`apps/desktop/vite.config.ts`
- 新增：`apps/desktop/vitest.config.ts`
- 新增：`apps/desktop/src/vite-env.d.ts`

**步骤：**

1. 从 `main` 创建 `.worktrees/phase-2-desktop-storage` 和 `feature/phase-2-desktop-storage`。
2. 安装 stable Rust，并确认 `rustc --version`、`cargo --version` 与 `xcode-select -p`。
3. 先添加一个会失败的前端 smoke test，证明桌面工作区尚不存在。
4. 建立最小 React/Vite/Vitest 包，补充根脚本：`dev:desktop`、`test`、`typecheck`、`build`，让它们同时覆盖 core 与 desktop。
5. 运行 `pnpm install`、桌面 smoke test、根类型检查和根构建。
6. 提交：`chore(desktop): scaffold React Tauri workspace`。

## Task 2：生成并固化桌面界面设计基线

**文件：**

- 新增：`docs/design/phase-2-ingredient-library-concept.png`
- 新增：`apps/desktop/src/styles/tokens.css`
- 新增：`apps/desktop/src/styles/global.css`
- 新增：`apps/desktop/src/test/design-tokens.test.ts`

**步骤：**

1. 使用 Image Gen 生成一个完整主屏概念：左侧简洁导航、顶部应用标题与搜索、原料表格、数据完整度状态、右侧创建/编辑抽屉、草稿恢复提示；中文界面，适合 13 英寸笔记本，不使用营销页结构。
2. 检查概念图的信息架构、表格密度、表单字段、状态与小屏适配；不清晰的局部重新生成。
3. 记录并实现设计令牌：背景、表面、文字、边框、强调色、语义色、圆角、阴影、间距、字体和动效。
4. 先写令牌契约测试，再创建 CSS 文件使其通过。
5. 提交：`design(desktop): define ingredient library interface`。

## Task 3：建立 Tauri 2 Rust 外壳

**文件：**

- 新增：`apps/desktop/src-tauri/Cargo.toml`
- 新增：`apps/desktop/src-tauri/Cargo.lock`
- 新增：`apps/desktop/src-tauri/build.rs`
- 新增：`apps/desktop/src-tauri/tauri.conf.json`
- 新增：`apps/desktop/src-tauri/capabilities/default.json`
- 新增：`apps/desktop/src-tauri/src/main.rs`
- 新增：`apps/desktop/src-tauri/src/lib.rs`
- 新增：`apps/desktop/src-tauri/icons/*`
- 修改：`apps/desktop/package.json`

**步骤：**

1. 先添加 Rust smoke test，要求库暴露可测试的 `build_app`/配置入口，并确认失败。
2. 按 Tauri 2 官方结构创建库与二进制入口，配置产品名、标识符、窗口最小尺寸、前端开发地址和构建目录。
3. 只开放后续命令所需的最小 capability，不启用 shell 或任意文件系统权限。
4. 运行 `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` 与 `pnpm --filter @food-rd/desktop build`。
5. 提交：`feat(desktop): add Tauri application shell`。

## Task 4：实现 SQLite 连接与显式迁移

**文件：**

- 新增：`apps/desktop/src-tauri/migrations/0001_initial.sql`
- 新增：`apps/desktop/src-tauri/src/database/mod.rs`
- 新增：`apps/desktop/src-tauri/src/database/migrations.rs`
- 新增：`apps/desktop/src-tauri/src/database/error.rs`
- 新增：`apps/desktop/src-tauri/tests/database_migrations.rs`
- 修改：`apps/desktop/src-tauri/src/lib.rs`

**步骤：**

1. 先写迁移测试：空数据库升级到版本 1；重复打开幂等；外键开启；失败迁移自动回滚。
2. 在 `0001_initial.sql` 创建：
   - `ingredients`
   - `app_settings`
   - `workspace_drafts`
   - `schema_migrations`
3. 实现连接配置、迁移校验和单事务执行；迁移记录包含版本、名称、校验值和执行时间。
4. 将数据库路径解析限制在 Tauri 应用数据目录；测试使用临时目录。
5. 运行迁移测试与 Clippy。
6. 提交：`feat(storage): add transactional SQLite migrations`。

## Task 5：实现数据库备份与恢复基础能力

**文件：**

- 新增：`apps/desktop/src-tauri/src/database/backup.rs`
- 新增：`apps/desktop/src-tauri/tests/database_recovery.rs`
- 修改：`apps/desktop/src-tauri/src/database/mod.rs`
- 修改：`apps/desktop/src-tauri/src/database/migrations.rs`

**步骤：**

1. 先写恢复测试：迁移前创建副本；故意破坏当前数据库后可恢复副本；失败恢复不覆盖现有文件；恢复后通过 `integrity_check`。
2. 使用同目录临时文件和原子重命名实现备份/恢复，避免半写入数据库。
3. 备份清单记录 schema 版本、创建时间、文件大小与 SHA-256；恢复前校验清单和数据库完整性。
4. 迁移失败时保留原数据库与备份，不自动静默覆盖，由上层展示恢复入口。
5. 运行数据库迁移与恢复全部测试。
6. 提交：`feat(storage): add verified database recovery`。

## Task 6：用仓储接口实现原料基础 CRUD

**文件：**

- 新增：`apps/desktop/src-tauri/src/ingredients/model.rs`
- 新增：`apps/desktop/src-tauri/src/ingredients/repository.rs`
- 新增：`apps/desktop/src-tauri/src/ingredients/mod.rs`
- 新增：`apps/desktop/src-tauri/tests/ingredient_repository.rs`
- 修改：`apps/desktop/src-tauri/src/lib.rs`

**步骤：**

1. 先写仓储测试，覆盖创建、读取、分页列表、名称/编号搜索、更新、编号唯一性、软删除以及事务回滚。
2. 定义基础原料字段：名称、内部编号、分类、标签、备注、密度、当前含税价、价格单位/日期、来源/来源日期及时间戳。
3. 对空名称、非法十进制字符串和重复编号返回结构化错误；不在 Rust 层复制营养/成本计算规则。
4. 每个写方法只在事务提交后返回成功，查询默认排除已归档原料。
5. 运行仓储测试、`cargo fmt --check` 与 Clippy。
6. 提交：`feat(storage): persist ingredient records`。

## Task 7：实现草稿恢复与本地设置仓储

**文件：**

- 新增：`apps/desktop/src-tauri/src/preferences.rs`
- 新增：`apps/desktop/src-tauri/src/drafts.rs`
- 新增：`apps/desktop/src-tauri/tests/preferences_and_drafts.rs`
- 修改：`apps/desktop/src-tauri/src/lib.rs`

**步骤：**

1. 先写测试：设置可覆盖读取；JSON 格式错误被拒绝；草稿可保存、恢复、更新和清除；失败写入不破坏上一版草稿。
2. 用受限键名和 JSON 字符串实现本地设置仓储。
3. 用 `kind + key` 唯一约束实现草稿仓储，并保存 payload 版本和更新时间。
4. 所有 upsert 通过事务完成。
5. 运行相关 Rust 测试。
6. 提交：`feat(storage): persist settings and recoverable drafts`。

## Task 8：暴露最小 Tauri 命令层

**文件：**

- 新增：`apps/desktop/src-tauri/src/commands/ingredients.rs`
- 新增：`apps/desktop/src-tauri/src/commands/preferences.rs`
- 新增：`apps/desktop/src-tauri/src/commands/drafts.rs`
- 新增：`apps/desktop/src-tauri/src/commands/mod.rs`
- 新增：`apps/desktop/src-tauri/tests/command_contract.rs`
- 修改：`apps/desktop/src-tauri/src/lib.rs`

**步骤：**

1. 先写命令契约测试，覆盖参数/响应序列化、分页、结构化错误码以及数据库错误不泄露本地路径。
2. 创建共享应用状态，持有数据库句柄与仓储；命令层只做反序列化、调用和错误映射。
3. 暴露：原料 list/get/create/update/archive，settings get/set，draft get/save/clear，database status/restore。
4. 注册命令并保持 capability 最小化。
5. 运行 Rust 全部测试。
6. 提交：`feat(desktop): expose local data commands`。

## Task 9：建立前端 DesktopApi 边界

**文件：**

- 新增：`apps/desktop/src/api/types.ts`
- 新增：`apps/desktop/src/api/desktop-api.ts`
- 新增：`apps/desktop/src/api/tauri-desktop-api.ts`
- 新增：`apps/desktop/src/api/browser-demo-api.ts`
- 新增：`apps/desktop/src/api/create-desktop-api.ts`
- 新增：`apps/desktop/src/api/desktop-api.test.ts`

**步骤：**

1. 先写前端契约测试：Tauri 适配器使用正确命令与参数；浏览器适配器遵循同一 CRUD、草稿和设置行为。
2. 定义与 Rust 命令一致的 TypeScript 类型和 `DesktopApi` 接口。
3. 正式 Tauri 环境使用 `invoke`；浏览器环境使用内存/localStorage 演示适配器并显示“浏览器演示数据”状态。
4. 统一将后端错误映射为前端可展示错误，不吞掉错误。
5. 运行前端测试与类型检查。
6. 提交：`feat(desktop): add typed local data API`。

## Task 10：实现原料库主屏与增删改查

**文件：**

- 新增：`apps/desktop/src/App.tsx`
- 新增：`apps/desktop/src/main.tsx`
- 新增：`apps/desktop/src/components/AppShell.tsx`
- 新增：`apps/desktop/src/components/*`
- 新增：`apps/desktop/src/features/ingredients/IngredientLibrary.tsx`
- 新增：`apps/desktop/src/features/ingredients/IngredientTable.tsx`
- 新增：`apps/desktop/src/features/ingredients/IngredientEditor.tsx`
- 新增：`apps/desktop/src/features/ingredients/useIngredients.ts`
- 新增：`apps/desktop/src/features/ingredients/*.test.tsx`
- 修改：`apps/desktop/src/styles/global.css`

**步骤：**

1. 先写用户流程测试：加载列表、搜索、打开新建抽屉、校验必填项、创建、编辑、软删除确认、错误提示和空状态。
2. 按概念图建立 app shell、导航、工具栏、表格、状态标识和右侧编辑抽屉；组件职责清晰，`App` 仅做组合。
3. 所有按钮具备可见 hover/focus/disabled 状态；表格与表单可通过键盘操作；危险操作二次确认。
4. 适配 1280×800 主视口，并为窄视口提供单列布局，不将表格粗暴改成大量卡片。
5. 运行流程测试、类型检查和构建。
6. 提交：`feat(desktop): build ingredient library workflow`。

## Task 11：接通表单自动保存与恢复提示

**文件：**

- 新增：`apps/desktop/src/features/ingredients/useIngredientDraft.ts`
- 新增：`apps/desktop/src/features/ingredients/IngredientDraftNotice.tsx`
- 新增：`apps/desktop/src/features/ingredients/ingredient-draft.test.tsx`
- 修改：`apps/desktop/src/features/ingredients/IngredientEditor.tsx`

**步骤：**

1. 先写测试：输入后防抖保存；重启界面恢复；用户可继续编辑或丢弃；成功保存原料后清除草稿；过期/未知版本草稿不直接应用。
2. 实现 500ms 防抖保存和显式状态（保存中、已保存、失败）。
3. 启动时仅提示存在草稿，由用户决定恢复；不得静默覆盖正在编辑的数据。
4. 运行草稿与原料工作流测试。
5. 提交：`feat(desktop): recover ingredient editor drafts`。

## Task 12：浏览器与桌面端验证、CI 和文档

**文件：**

- 修改：`.github/workflows/ci.yml`
- 新增：`apps/desktop/README.md`
- 新增：`docs/testing/phase-2-manual-checklist.md`
- 新增：`docs/testing/screenshots/phase-2-ingredient-library.png`

**步骤：**

1. CI 增加前端测试/构建和 Rust fmt/test/clippy；桌面打包矩阵留到发布阶段，本阶段至少对 macOS/Windows 运行 Rust 测试与前端构建。
2. 启动 Vite，用内置浏览器完成创建、编辑、搜索、删除和草稿恢复流程；检查桌面、当前视口与窄视口。
3. 启动 `pnpm tauri dev`，在真实桌面窗口重复关键 CRUD，并重启应用确认 SQLite 数据与草稿仍在。
4. 截取实现图，与概念图分别用 `view_image` 检查；记录至少五项视觉比对（布局、文字、表格密度、颜色、间距、图标、响应式），修复所有可修复偏差。
5. 执行最终命令：

   ```bash
   pnpm install --frozen-lockfile
   pnpm typecheck
   pnpm test
   pnpm build
   cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
   cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
   cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
   ```

6. 编写中文测试说明，明确普通用户如何运行浏览器测试和 Tauri 桌面测试，以及数据库文件位置与清理方法。
7. 提交：`ci: verify desktop shell and local storage`。

## 第二阶段验收标准

- `main` 上的第一阶段计算包继续通过 27 项既有测试。
- React 原料库可在浏览器演示模式与 Tauri 窗口运行；增、查、改、归档均有自动化测试。
- Tauri 正式环境的数据进入 SQLite，重启后仍存在。
- 编辑草稿可在重启后提示恢复，成功保存或主动丢弃后清除。
- 设置、原料与草稿写入使用事务；数据库迁移幂等且失败回滚。
- 迁移前备份可校验并恢复，损坏/失败不会静默覆盖原数据库。
- 前端、Rust、数据库、构建和关键手工流程均有可复现验证记录。

