# GitHub 开源上线步骤

这份指南用于维护者第一次把食研工作台公开到 GitHub。创建远端、推送、开启安全功能和发布 Release 都会改变外部状态，必须逐步确认；本地完成这些文件并不等于已经公开。

## 1. 发布前本地检查

在仓库根目录执行：

```bash
pnpm open-source:verify
pnpm typecheck
pnpm test
pnpm build
cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets
```

确认 `git status` 中没有数据库、`.foodrd-backup`、API Key、供应商文件、构建缓存、日志或临时导出。安装包位于被 Git 忽略的 `dist/installers/`，不要直接提交到源码分支。

## 2. 创建空远端仓库

在 GitHub 创建公开仓库时，建议不要勾选自动生成 README、LICENSE 或 `.gitignore`，因为本地已经有正式版本。仓库名、组织或个人账号需要维护者确认后再使用。

创建完成后，在本地添加远端。下面的地址只是格式示例，不能原样执行：

```bash
git remote add origin git@github.com:<账号或组织>/<仓库名>.git
git remote -v
```

第一次推送属于外部发布操作，应先检查提交范围，再单独确认：

```bash
git push -u origin main
```

## 3. 仓库基础设置

在 GitHub 仓库设置中完成：

- 默认分支为 `main`。
- 合并前要求 Pull Request，并要求 `.github/workflows/ci.yml` 的 macOS 与 Windows 检查通过。
- 禁止直接强制推送或删除 `main`。
- Actions 的默认 `GITHUB_TOKEN` 保持只读内容权限；安装包工作流不需要写 Release 权限。
- 启用 **Security → Private vulnerability reporting**，然后实际预览 `SECURITY.md` 中的报告入口。
- 检查 Issue 与 Pull Request 模板是否能正常显示中文字段。

第一版不必立即开启自动依赖升级、自动发布或自动更新。先确保人工构建和恢复流程稳定，再单独评估这些自动化的权限与噪声。

## 4. 首次跨平台构建

推送后先查看 `CI` 工作流。全部通过后，在 **Actions → Build unsigned desktop installers → Run workflow** 中人工运行安装包构建。

应得到三个 Artifact：

- `food-rd-studio-macos-arm64`
- `food-rd-studio-macos-x64`
- `food-rd-studio-windows-x64`

每个 Artifact 应包含安装包、`LICENSE`、`NOTICE`、当前平台的 `THIRD_PARTY_LICENSES.md` 和 `SHA256SUMS.txt`。下载后在对应系统核对校验和并完成安装、首次启动、重启、备份、恢复和卸载测试。

工作流成功只能证明构建产物生成，不能替代真实机器试装。

## 5. 创建首个 Release

只有在三平台验证完成后再创建 `v0.1.0` 标签和 Release。使用 `docs/releases/v0.1.0-draft.md` 作为基础，但发布前必须：

1. 删除草稿警告和所有占位、待验证文字。
2. 使用最终下载 Artifact 重新计算 SHA-256。
3. 上传三平台安装包、对应校验和、`LICENSE`、`NOTICE` 和平台依赖清单。
4. 明确写出 macOS 未公证、Windows 未签名以及可能出现的系统安全提示。
5. 链接安装、备份、升级和数据安全说明。
6. 从 Release 页面重新下载一次，确认文件未传错且校验和匹配。

不要把本机验收构建的哈希复制到正式 Release；每次重建后的文件都可能不同。

## 6. 发布后最小维护

- 记录每个版本实际验证的系统与硬件，不把单平台结果外推到全部平台。
- 安全问题走私密渠道，普通功能问题使用脱敏 Issue。
- 数据迁移、备份格式、Agent 权限或 Tauri capability 变化必须在发布说明中单独列出。
- 发布失败时先撤下错误附件，不要用同一文件名静默替换而不更新校验和和说明。
