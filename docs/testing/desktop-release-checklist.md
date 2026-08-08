# 桌面发布包装验收记录

日期：2026-08-08

## 本轮范围

- 验证 macOS Apple Silicon 的 Tauri 发布构建、ad-hoc 签名、DMG、SHA-256 和隔离首次启动。
- 静态检查 macOS Intel 与 Windows x64 的 GitHub 手动构建配置。
- 不创建 GitHub Release，不推送安装包，不使用付费开发者证书。

## 环境与产物

- 本机平台：macOS Apple Silicon（arm64）。
- 应用版本：`0.1.0`。
- 包标识：`com.foodrd.studio`。
- 最低系统版本配置：macOS `10.15`。
- 安装包：`dist/installers/food-rd-studio-0.1.0-macos-arm64.dmg`。
- SHA-256：`9f2a63065575ee630045b141b599c0526aae3ab792ba35f237702e813a2ba953`。

## 已验证

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 前端发布构建 | 通过 | Vite 成功生成生产产物；仅保留既有的大分块提示 |
| Rust Release 构建 | 通过 | `food-rd-desktop` 与 `food_rd_mcp` 均生成 arm64 Mach-O 可执行文件 |
| `.app` 打包 | 通过 | Tauri 生成 `食研工作台.app` |
| ad-hoc 签名 | 通过 | `codesign --verify --deep --strict` 通过；`Signature=adhoc`，无 TeamIdentifier |
| 应用元数据 | 通过 | 名称、`0.1.0`、`com.foodrd.studio` 和 macOS `10.15` 与配置一致 |
| DMG 生成 | 通过 | 无 Finder AppleScript 的脚本成功生成 UDZO 镜像 |
| DMG 完整性 | 通过 | `hdiutil verify` 与 `SHA256SUMS.txt` 校验均通过 |
| DMG 内容 | 通过 | 只读挂载后包含 `食研工作台.app` 和指向 `/Applications` 的快捷入口 |
| 开源许可证文件 | 通过 | DMG 根目录、`.app/Contents/Resources/licenses/` 和归集 Artifact 均包含 `LICENSE`、`NOTICE` 与 `THIRD_PARTY_LICENSES.md` |
| 许可证内容一致性 | 通过 | DMG 根目录与应用资源中的三份文件均和源码逐字节一致 |
| 镜像内应用签名 | 通过 | 对只读挂载后的 `.app` 再次执行严格签名校验并通过 |
| 隔离首次启动 | 通过 | 临时 HOME 中创建 `food-rd.sqlite3`，`PRAGMA integrity_check` 返回 `ok` |
| 数据库迁移 | 通过 | 首次启动后记录 11 个迁移；使用同一临时 HOME 重启后仍为 11 个且完整性正常 |
| 真实用户数据隔离 | 通过 | 冒烟测试只使用 `/private/tmp/foodlab-release-smoke-home`，未读取或修改正式数据目录 |
| 工作流语法 | 通过 | YAML 可解析；macOS arm64、macOS x64、Windows x64 矩阵与产物归集步骤完整 |
| 干净运行器品牌校验 | 通过（静态） | 工作流显式安装 Python 3.12 和 `scripts/branding/requirements.txt` 后再校验品牌资源 |

## 尚未验证

- Windows x64 NSIS 安装包的真实构建、SmartScreen、安装、卸载和 WebView2 行为；需要在 GitHub Actions 或 Windows 机器执行。
- macOS Intel DMG 的真实构建与 Intel Mac 试装；需要运行 `macos-15-intel` job 并在对应硬件验证。
- 从互联网下载后带隔离属性的 DMG 所触发的 Gatekeeper 实际文案；本机自产物不会自然带该属性。
- 拖入 `/Applications` 后的正式安装、升级覆盖和卸载流程；本轮为避免影响现有数据，只验证了隔离启动。
- GitHub Artifact 和 Release 页面展示；当前仓库没有可用远端，本轮也未获授权推送或公开发布。

在上述平台验证完成前，“桌面发布包装”保持进行中，不把本机 macOS 结果外推为跨平台发布完成。
