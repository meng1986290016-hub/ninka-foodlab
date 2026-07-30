# 食研工作台桌面应用

食研工作台是一个面向食品研发人员的开源本地应用。当前已经完成供应商维度的原料库、原料资料导入和食品研发 Agent：同一种原料可以保存多家供应商版本，每个版本独立记录价格、型号/规格、营养数据、数据来源和研发备注，并可并排比较。

## 当前可用功能

- 按“通用原料 → 供应商版本”管理原料，例如“脱脂乳粉”下保存多个供应商版本。
- 创建和维护自定义分类、供应商与通用原料。
- 供应商版本独立记录当前含税价、单位、型号/规格、密度、数据来源和研发备注。
- 按每 100 g 或每 100 mL 录入营养成分；留空表示未知，输入 `0` 表示已经确认该值为零。
- 搜索、编辑、复制、归档以及同种原料供应商版本比较。
- 编辑草稿自动保存，重新打开时可恢复或丢弃。
- 从 CSV、XLSX、图片、PDF、DOCX 和文本资料建立待复核原料草稿，并保留原始来源附件。
- 在全局 Agent Chat 中一次上传多份资料，按“原料 + 供应商 + 型号/规格”分别建立草稿。
- Agent 草稿支持重新识别、合并、拆分、放弃和人工复核；只有用户点击保存后才进入原料库。
- 支持 OpenAI、Anthropic、Gemini、Azure OpenAI、DeepSeek、Kimi 中国、智谱 GLM、MiniMax 中国、阿里百炼、火山引擎、Ollama、自定义兼容接口、Codex CLI 和 Claude Code CLI。
- 浏览器演示数据保存在 `localStorage`；Tauri 桌面版使用本地 SQLite。

## 环境要求

- Node.js 24（仓库要求 `>=24.14.0 <25`）
- pnpm 11.7.0
- 运行桌面版还需要 Rust stable；按 [Rust 官方安装说明](https://www.rust-lang.org/tools/install) 安装即可

如果终端提示 `pnpm: command not found`，可先执行：

```bash
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

## 浏览器演示版

在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm dev:desktop
```

然后访问 <http://127.0.0.1:1420>。浏览器演示版便于快速体验和前端开发，但数据只保存在当前浏览器中，不适合作为正式研发资料库。

演示数据键为 `food-rd.browser-demo.v4`。如需重置，可在浏览器开发者工具的“应用/存储 → 本地存储”中先导出或备份，再删除这个键并刷新页面。旧版演示数据会在首次读取时自动迁移。

浏览器中的 Agent 是本机离线模拟，适合体验上传、草稿卡和人工保存流程。它不会启动 Codex CLI 或 Claude Code CLI，也不会调用真实模型服务和产生费用。

## Tauri 桌面版

先确认 Rust 可用：

```bash
rustc --version
cargo --version
```

然后在仓库根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm tauri:dev
```

当前配置用于从源码开发和测试，暂未生成安装包，也不要求代码签名。开源用户可直接从源码运行。

桌面版数据库文件名为 `food-rd.sqlite3`，常见位置如下：

- macOS：`~/Library/Application Support/com.foodrd.studio/food-rd.sqlite3`
- Windows：`%APPDATA%\com.foodrd.studio\food-rd.sqlite3`
- Linux：`$XDG_DATA_HOME/com.foodrd.studio/food-rd.sqlite3`（未设置时通常位于 `~/.local/share` 下）

重置桌面数据前请先退出应用，然后把数据库文件重命名为备份，例如 `food-rd.sqlite3.backup`；再次启动会自动创建新数据库。确认不再需要旧数据后，再自行删除备份。不要在应用运行时移动数据库文件。

## 食品研发 Agent

1. 打开“设置 → 通用”，确认“启用食品研发 Agent”已经打开。
2. 打开“设置 → LLM 模型”，选择并启用一个模型服务。
3. API 模型需要填写服务地址、API 密钥和模型；密钥保存后不会在界面中回显。
4. Ollama 使用本机服务，不需要 API 密钥。自定义模型服务可分别保存 OpenAI 兼容和 Anthropic 兼容两套配置。
5. Codex CLI 或 Claude Code CLI 需要先在本机安装并完成各自登录；设置页可以检测程序、版本和登录状态，也支持手动填写程序路径。
6. 点击应用顶部的“Agent”，选择多份原料资料并说明任务。远程模型首次接收文件前会要求确认；本机模型会显示本地处理提示。
7. Agent 只创建待复核草稿。逐张点击“打开并检查”，确认供应商、型号/规格、价格、营养和过敏原后，再点击“保存供应商版本”。

手工维护原料、表格导入和后续配方功能不依赖模型。关闭 Agent 或没有配置模型时，这些功能仍可正常使用。完整验收步骤与故障排查见 [第三阶段 3B 验收清单](../../docs/testing/phase-3b-food-rd-agent-checklist.md)。

## 使用要点

1. 先创建或选择自定义分类，再创建通用原料。
2. 展开通用原料，添加供应商版本；供应商不存在时可以在选择框中直接新建。
3. 在“基本信息”中记录价格、来源和研发备注，在“营养成分”中选择基准并录入数据。
4. 勾选同一通用原料下的两个或更多版本，点击“比较供应商版本”。不同通用原料不能放在同一张比较表中。
5. 配方模块后续必须引用具体供应商版本，而不是只引用通用原料，这样成本和营养计算才有明确数据来源。

## 自动化验证

在仓库根目录执行：

```bash
pnpm test
pnpm typecheck
pnpm build
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -A clippy::filter-map-bool-then -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets
```

GitHub Actions 会在 macOS 和 Windows 上执行同一组前端与 Rust 检查。Tauri capability 当前只启用 `core:default`，没有 shell 权限或不受限制的文件系统权限。
