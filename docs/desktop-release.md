# 桌面发布与安装说明

## 发布边界

第一版提供免开发者证书的安装包：

- macOS：生成 `.dmg` 和 `.app`，使用 ad-hoc 技术签名，不使用 Apple Developer ID，也不做公证。
- Windows：生成当前用户安装模式的 NSIS `.exe`，不做 Authenticode 签名，不要求管理员权限。
- GitHub 工作流只在人工点击运行时构建并上传临时 Artifact，不自动创建 Release、不推送标签，也不公开发布。

macOS 的 ad-hoc 签名不代表开发者身份，也不能消除 Gatekeeper 提示；它只是 Apple Silicon 从互联网运行应用时需要的最低技术签名。Windows 未签名安装包也会显示“未知发布者”或 SmartScreen 提示。

## 本机打包

先在仓库根目录安装依赖并完成校验：

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm brand:verify
```

macOS 必须在 macOS 机器执行：

```bash
pnpm desktop:bundle:macos
pnpm desktop:bundle:macos:dmg
pnpm desktop:artifacts
```

Windows 必须在 Windows x64 机器执行：

```powershell
pnpm desktop:bundle:windows
pnpm desktop:artifacts
```

macOS 先由 Tauri 生成并 ad-hoc 签名 `.app`，再用不调用 Finder AppleScript 的确定性脚本生成简洁 DMG，适合本机和无图形界面的 CI。整理后的下载文件位于 `dist/installers/`，同时包含 `LICENSE`、`NOTICE`、按当前平台重新生成的 `THIRD_PARTY_LICENSES.md` 和 `SHA256SUMS.txt`。原始 Tauri 产物仍保留在 `apps/desktop/src-tauri/target/release/bundle/`。

## GitHub 手动构建

仓库包含 `.github/workflows/build-installers.yml`，在 GitHub 的 **Actions → Build unsigned desktop installers → Run workflow** 中人工运行。默认的 `windows-x64` 只构建 Windows 安装包，适合 Windows 修复验证；只有需要同时发布三个平台时才选择 `all-platforms`。完整矩阵分别使用：

- `macos-15`：Apple Silicon DMG。
- `macos-15-intel`：Intel DMG。
- `windows-2025`：Windows x64 NSIS 安装包。

每个平台上传独立 Artifact，保留 14 天，并包含安装包、许可证文件、平台依赖清单和 `SHA256SUMS.txt`。工作流不会创建 GitHub Release；正式公开前仍需人工下载、试装、核对版本与校验和，再单独决定是否发布。

Windows job 会在构建后将 NSIS 安装包静默安装到 runner 的临时目录，然后校验内置 Agent 运行时、开始菜单与桌面快捷方式目标，并用 `\\?\C:\...` 扩展路径实际启动和停止 Agent。这可以发现缺少文件、架构错误、错误快捷方式和 Node 不兼容扩展路径等问题，但不能代替真实 Windows 电脑上的界面、WebView2、SmartScreen、覆盖升级和数据持久化验收。

## macOS 安装

1. 下载与 Mac 架构匹配的 DMG：Apple Silicon 选择 `arm64`，Intel Mac 选择 `x64`。
2. 对照同一 Artifact 内的 `SHA256SUMS.txt` 验证文件完整性。
3. 打开 DMG，把“Ninka FoodLab”拖入“应用程序”。
4. 首次打开如果被 Gatekeeper 阻止，前往“系统设置 → 隐私与安全性”，确认文件来自本项目后点击“仍要打开”；也可以在 Finder 中按住 Control 点击应用并选择“打开”。

不要为了绕过提示而对来源不明的应用批量删除隔离属性。当前最低系统版本配置为 macOS 13.5；真实兼容性仍以每个发布版本的试装结果为准。

## Windows 安装

1. 下载 `windows-x64` Artifact 中的 `*-setup.exe`，并核对 `SHA256SUMS.txt`。
2. 如果 SmartScreen 显示“Windows 已保护你的电脑”，确认来源和校验和无误后，点击“更多信息 → 仍要运行”。
3. 安装器默认写入当前用户目录，不要求管理员权限。Windows 10/11 通常已经包含 WebView2；若系统缺失，安装过程可能需要联网获取运行环境。

当前 Windows x64 包虽然会在 Windows GitHub Actions runner 上完成安装和运行时自检，但在真实 Windows 10/11 x64 设备完成首次试装前，必须继续标记为“待实机验证”。

## 发布前人工验收

- 安装包文件名、应用内版本和 `tauri.conf.json` 版本一致。
- 应用图标在安装器、应用列表、任务栏或 Dock 中显示正确。
- 首次启动可以创建本地数据库，原料库、配方库和设置页可正常打开。
- 退出并重开后数据仍然存在；备份创建和恢复至少完成一次冒烟测试。
- 卸载不会误删用户主动导出的 `.foodrd-backup` 文件。
- 在发布页明确写出“未使用开发者证书签名”，并提供本说明和 SHA-256 校验和。

本机与平台验证结果记录在[桌面发布包装验收记录](testing/desktop-release-checklist.md)。未实际运行的平台必须继续标记为待验证，不能用工作流配置代替真实安装结果。
