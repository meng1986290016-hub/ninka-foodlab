# Ninka FoodLab 0.2.0 内测说明

感谢你帮助测试 Ninka FoodLab。

Ninka FoodLab 是一款面向食品研发人员的本地桌面应用，目前提供原料管理、供应商与规格管理、配方研发、营养和成本试算、配方版本、打样清单以及食品研发 Agent 等功能。

> 这是早期内测版本，不建议用于保存唯一一份正式研发资料，也不能代替实验检测、法规审核或正式成本核算。

## 系统要求

- macOS 13.5 或更高版本：Apple Silicon（M1 及更新芯片）选择 `arm64`，Intel 芯片选择 `x64`。
- Windows 10/11 64 位：选择 `windows-x64` 安装包。

> Windows x64 安装包由 GitHub Actions 在 Windows 主机上构建和自动校验，但当前仍需要完成真实 Windows 电脑的首次试装。在该验收完成前，它只用于内部测试。

## 安装文件

- Apple Silicon：`food-rd-studio-0.2.0-macos-arm64.dmg`
- Intel Mac：`food-rd-studio-0.2.0-macos-x64.dmg`
- Windows x64：`windows-x64` Artifact 或发布页中名称以 `-setup.exe` 结尾的安装包。
- 每个平台文件的 SHA-256 均记录在与安装包一起提供的 `SHA256SUMS.txt`。

SHA-256 用于确认下载后的安装包没有损坏或被替换。由于当前安装包没有正式开发者签名，强烈建议在安装前校验，尤其是在需要绕过 Gatekeeper 或 SmartScreen 提示时。macOS 可在“终端”中运行：

```bash
shasum -a 256 food-rd-studio-0.2.0-macos-arm64.dmg
shasum -a 256 food-rd-studio-0.2.0-macos-x64.dmg
```

Windows 可在 PowerShell 中运行：

```powershell
Get-FileHash .\*-setup.exe -Algorithm SHA256
```

输出值应与 `SHA256SUMS.txt` 中对应文件名的记录一致。

## 安装步骤

### macOS

1. 根据 Mac 芯片下载并双击对应的 `arm64` 或 `x64` DMG。
2. 将 `Ninka FoodLab.app` 拖入“应用程序”文件夹。
3. 在“应用程序”中打开 `Ninka FoodLab`。
4. 使用完安装镜像后，可以在 Finder 中推出 `Ninka FoodLab` 磁盘。

### Windows

1. 下载并双击 `-setup.exe` 安装包。
2. 按安装向导完成当前用户安装，不需要管理员权限。
3. 从开始菜单打开 `Ninka FoodLab`。

## 第一次打开时的安全提示

### macOS

当前内测包没有使用付费 Apple Developer ID 证书，也没有经过 Apple 公证，因此 macOS 第一次打开时可能提示无法验证开发者。

请先确认安装包确实由测试邀请人提供，再按以下步骤操作：

1. 尝试打开一次 `Ninka FoodLab`。
2. 打开“系统设置”。
3. 进入“隐私与安全性”，向下找到“安全性”。
4. 点击与 Ninka FoodLab 对应的“仍要打开”。
5. 输入 Mac 登录密码并确认。

“仍要打开”通常只会在尝试打开应用后的一小时内显示。Apple 官方说明：

<https://support.apple.com/zh-cn/guide/mac-help/-mh40616/mac>

请不要关闭整个 macOS 安全机制，也不需要运行来源不明的终端命令。

### Windows

当前 Windows 内测包没有 Authenticode 数字签名，因此 SmartScreen 可能显示“Windows 已保护你的电脑”或“未知发布者”。请先确认文件来自本项目并核对 SHA-256，再选择“更多信息 → 仍要运行”。不要对来源不明的安装包跳过此检查。

## 建议测试内容

请按自己的真实研发习惯使用，也可以重点检查以下流程：

1. **首次启动**：应用能否正常打开，页面是否完整，有无空白或错位。
2. **原料库**：新建通用原料，增加不同供应商、型号或规格，填写价格和营养数据。
3. **配方库**：新建配方，从配方库进入工作台，添加原料并修改用量。
4. **实时结果**：检查当前投料合计、出成重量、营养试算和成本是否随配方变化。
5. **版本管理**：保存正式版本、建立替代配方、归档和取消归档。
6. **我要打样**：输入计划打样量，查看配料清单，并尝试打印或导出 Excel。
7. **Ninka Agent**：如已配置模型，可测试原料资料读取和配方提案；未配置模型时可以跳过。
8. **关闭与重启**：退出应用后重新打开，确认已保存的数据仍然存在。

营养和成本结果属于研发试算。原料缺失的数据不会被当作零，出现“数据不足”时请记录具体操作和页面。

## 数据与隐私

- 原料、配方等业务数据默认保存在测试者自己的电脑上。
- macOS 本地数据库位置：`~/Library/Application Support/com.foodrd.studio/food-rd.sqlite3`。
- Windows 本地数据默认位于当前用户的 `%APPDATA%\com.foodrd.studio\` 目录。
- 不使用 Agent 时，日常原料和配方操作不需要上传到远程服务器。
- 如果主动配置并使用第三方大模型 API，发送给模型的内容将受对应模型服务商的规则约束，请勿使用真实机密配方进行早期测试。
- API 密钥不要放在反馈截图或聊天记录中。

## 如何反馈问题

发现问题时，请尽量提供：

- 设备型号和架构，例如 MacBook Air M2 或 Windows x64 电脑。
- 操作系统及版本。
- 问题出现在哪个页面。
- 出现问题前依次进行了哪些操作。
- 实际出现了什么，以及你原本期望看到什么。
- 页面截图或报错截图；截图前请遮挡 API 密钥和敏感配方。
- 关闭并重新打开应用后，问题是否仍会出现。

可以复制下面的模板：

```text
【设备与架构】
【操作系统及版本】
【问题页面】
【操作步骤】1.  2.  3.
【实际结果】
【期望结果】
【能否重复出现】每次 / 偶尔 / 只出现一次
【重启后是否仍存在】是 / 否
【补充截图】
```

## 卸载

在 macOS 中，只需在“应用程序”文件夹中将 `Ninka FoodLab.app` 移到废纸篓。在 Windows 中，请从“设置 → 应用 → 已安装的应用”中卸载。

这样不会自动删除本地研发数据。如果确实要清空全部测试数据，请先做好备份，再删除：

```text
~/Library/Application Support/com.foodrd.studio/
%APPDATA%\com.foodrd.studio\
```

删除这个目录会永久移除本机保存的原料、配方、设置和相关记录，请谨慎操作。

感谢你的测试和真实反馈。
