# 参与贡献

感谢你参与食研工作台。项目面向真实食品研发场景，优先保证数据可追溯、离线可用、计算确定性和人工确认边界。

## 提交问题前

缺陷报告请尽量包含：

- 操作系统、应用版本和运行方式（浏览器演示或 Tauri 桌面版）。
- 可以重复的最短操作步骤、预期结果和实际结果。
- 不含真实供应商秘密、配方、API Key 或个人信息的截图或演示数据。
- 如果涉及营养或成本计算，请注明单位、密度、投料量、出成重量和使用的规则版本。

法规、标准实施日期、模型能力和服务商接口容易变化。提出相关改动时，请给出可核实的一手来源，并把事实、推断和建议分开描述。

## 本地开发

需要 Node.js `>=24.14.0 <25`、pnpm `11.7.0` 和 Rust stable。没有 pnpm 时可以执行：

```bash
npm install --global pnpm@11.7.0
```

安装依赖并运行浏览器演示模式：

```bash
pnpm install --frozen-lockfile
pnpm dev:desktop
```

运行 Tauri 桌面版：

```bash
pnpm tauri:dev
```

## 修改原则

- 不把未知营养值当作零，也不把估算结果描述为检测或正式合规结论。
- 核心营养、成本、单位和版本规则放在确定性代码中，不交给模型“心算”。
- Agent 可以读取、试算和创建待复核草稿；保存正式版本、删除和覆盖数据必须保留人工确认。
- 正式配方、标签和报告使用不可变快照；基础数据更新不能静默改写历史结果。
- 数据库变更使用新的顺序迁移，不修改已经发布的迁移文件。
- 第一版实验工艺和感官评价保持单一研发备注框，除非产品范围另有确认。
- 新增网络、shell、文件系统或 MCP 权限时，需要单独说明必要性、数据范围和失败保护。

## 提交前验证

至少运行与你的修改直接相关的测试。合并前的完整验证命令为：

```bash
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets
```

修改品牌资产时，还需运行：

```bash
pnpm brand:verify
```

修改桌面安装包时，请按照[桌面发布说明](docs/desktop-release.md)和[验收记录模板](docs/testing/desktop-release-checklist.md)核对产物，不要只以“命令没有报错”作为安装验证。

## Pull Request 内容

请在 PR 中写清楚：

1. 用户会看到什么变化。
2. 修改了哪些数据或计算边界。
3. 运行了哪些测试，哪些平台或场景没有验证。
4. 是否包含迁移、权限、网络、备份格式或不可变快照变化。
5. 如使用 AI 辅助生成代码，贡献者仍需自行复核并对结果负责。

不要提交真实数据库、`.foodrd-backup`、供应商资料、API Key、构建缓存、运行日志或临时导出文件。

## 许可证

提交贡献即表示你有权提供该内容，并同意按仓库的 [Apache License 2.0](LICENSE) 发布。第三方代码、字体、图片或数据必须注明来源与许可证，不能仅因可以下载就复制进仓库。
