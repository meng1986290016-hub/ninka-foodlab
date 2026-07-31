# `.foodrd-backup` 离线备份格式

## 目标与边界

`.foodrd-backup` 是食研工作台的本地、离线、可校验备份包。它用于保护用户的原料、供应商、配方、标签、报告、Agent 会话及来源附件，不是加密容器，也不提供来源真实性签名。

格式版本与数据库 schema 版本分别管理：

- `formatVersion` 描述备份包结构，当前为 `1`。
- `schemaVersion` 描述包内 SQLite 数据库版本，当前为 `7`。
- 完整性由每个业务文件的 SHA-256 提供，主要检测文件损坏、截断和不完整复制。

## ZIP 白名单结构

```text
manifest.json
database.sqlite3
attachments/<哈希前两位>/<SHA-256>.<扩展名>
```

除此之外的 ZIP 条目一律拒绝。绝对路径、`..`、反斜杠路径、目录条目、符号链接、重复条目和未在清单登记的文件均视为无效。

## 清单字段

`manifest.json` 使用 UTF-8 JSON，字段为 camelCase：

```json
{
  "formatVersion": 1,
  "applicationId": "food-rd-studio",
  "applicationVersion": "0.1.0",
  "createdAt": "2026-07-31T10:30:00+08:00",
  "schemaVersion": 7,
  "database": {
    "path": "database.sqlite3",
    "byteSize": 409600,
    "sha256": "<64 位小写十六进制>"
  },
  "attachments": [],
  "totals": {
    "attachmentCount": 0,
    "totalBytes": 409600
  }
}
```

`totalBytes` 是数据库快照与清单中所有附件解压后大小之和，不含 `manifest.json`。

## 纳入与排除规则

只纳入以下数据：

1. 通过 SQLite Online Backup API 创建的一致性数据库快照。
2. 快照中 `source_attachments` 表登记、且实际大小与 SHA-256 完全匹配的附件。

明确排除：

- 系统钥匙串中的 API Key 或其他秘密；数据库只保存不可用作认证的 `secret_ref` 引用。
- 应用数据目录中的其他文件。
- 未在数据库登记的孤立附件。
- `.partial`、`.tmp`、模型响应缓存及其他临时文件。
- 指向附件目录外部的符号链接。

用户业务文本本身不做内容删改；因此该格式不应被视为脱敏导出。

## 创建与原子性

1. 在目标文件同一目录创建唯一 staging 目录。
2. 生成 SQLite 一致性快照并执行 `PRAGMA quick_check`。
3. 按数据库白名单复制附件，逐个核对大小和 SHA-256。
4. 生成清单并写入临时 ZIP 文件。
5. 重新打开临时 ZIP，对所有条目、大小和 SHA-256 做完整回读。
6. 仅在回读成功后原子替换目标 `.foodrd-backup`。
7. 无论成功或失败都清理 staging 与临时 ZIP；失败时保留已有目标文件。

## 校验与后续恢复

纯包校验确认结构、白名单、大小与 SHA-256。恢复前还必须额外执行数据库完整性、schema 兼容范围、恢复影响统计和当前数据安全副本检查；这些属于恢复协调器，不由 ZIP 完整性校验替代。
