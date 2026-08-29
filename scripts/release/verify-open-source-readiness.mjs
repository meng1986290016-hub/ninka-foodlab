import { access, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_LICENSES.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/desktop-release.md",
  "docs/data-safety.md",
  "docs/upgrade-guide.md",
  "docs/open-source-readiness.md",
  "docs/github-publishing.md",
  ".github/ISSUE_TEMPLATE/bug-report.yml",
  ".github/ISSUE_TEMPLATE/feature-request.yml",
  ".github/ISSUE_TEMPLATE/config.yml",
  ".github/pull_request_template.md",
];

async function requireFile(relativePath) {
  await access(resolve(root, relativePath));
}

for (const file of requiredFiles) {
  await requireFile(file);
}

const packageFiles = [
  "package.json",
  "apps/desktop/package.json",
  "packages/core/package.json",
];

const packageVersions = new Set();
for (const file of packageFiles) {
  const manifest = JSON.parse(await readFile(resolve(root, file), "utf8"));
  if (manifest.license !== "Apache-2.0") {
    throw new Error(`${file} 必须声明 Apache-2.0`);
  }
  packageVersions.add(manifest.version);
}

const tauriConfig = JSON.parse(
  await readFile(resolve(root, "apps/desktop/src-tauri/tauri.conf.json"), "utf8"),
);
packageVersions.add(tauriConfig.version);
if (packageVersions.size !== 1) {
  throw new Error(`应用版本不一致：${[...packageVersions].join(", ")}`);
}
const [appVersion] = packageVersions;
const currentReleaseDoc = `docs/releases/v${appVersion}.md`;
await requireFile(currentReleaseDoc);

const cargoManifest = await readFile(
  resolve(root, "apps/desktop/src-tauri/Cargo.toml"),
  "utf8",
);
if (!/^license\s*=\s*"Apache-2\.0"\s*$/m.test(cargoManifest)) {
  throw new Error("Cargo.toml 必须声明 Apache-2.0");
}
const cargoVersion = cargoManifest.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1];
if (cargoVersion !== appVersion) {
  throw new Error(`Cargo.toml 版本 ${cargoVersion ?? "缺失"} 与应用版本 ${appVersion} 不一致`);
}

const license = await readFile(resolve(root, "LICENSE"), "utf8");
if (!license.includes("Apache License") || !license.includes("Version 2.0")) {
  throw new Error("LICENSE 不是 Apache License 2.0 文本");
}
// Git may materialize text files with CRLF on Windows. Verify the license
// content independently of the checkout platform's line-ending convention.
const normalizedLicense = license.replace(/\r\n?/g, "\n");
const licenseHash = createHash("sha256")
  .update(normalizedLicense)
  .digest("hex");
if (
  licenseHash !==
  "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
) {
  throw new Error("LICENSE 与 Apache 官方 2.0 文本不一致");
}

const thirdParty = await readFile(
  resolve(root, "THIRD_PARTY_LICENSES.md"),
  "utf8",
);
if (
  !thirdParty.includes("## JavaScript dependencies") ||
  !thirdParty.includes("## Rust dependencies") ||
  thirdParty.includes("UNKNOWN")
) {
  throw new Error("第三方许可证清单不完整或包含未知许可证");
}

const migrations = await readFile(
  resolve(root, "apps/desktop/src-tauri/src/database/migrations.rs"),
  "utf8",
);
const schemaMatch = migrations.match(
  /LATEST_SCHEMA_VERSION:\s*i64\s*=\s*(\d+)/,
);
if (!schemaMatch) {
  throw new Error("无法读取 Rust 最新 schema 版本");
}
const schemaVersion = schemaMatch[1];
const backupFormat = await readFile(
  resolve(root, "docs/backup-format.md"),
  "utf8",
);
if (!backupFormat.includes(`\`1..=${schemaVersion}\``)) {
  throw new Error(`备份文档没有声明当前 schema 1..=${schemaVersion}`);
}

const markdownFiles = [
  "README.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "docs/desktop-release.md",
  currentReleaseDoc,
];

function relativeTargets(markdown) {
  const targets = [];
  const markdownLink = /!?\[[^\]]*\]\(([^)]+)\)/g;
  const htmlSource = /\bsrc=["']([^"']+)["']/g;
  for (const pattern of [markdownLink, htmlSource]) {
    for (const match of markdown.matchAll(pattern)) {
      targets.push(match[1].trim().replace(/^<|>$/g, ""));
    }
  }
  return targets;
}

for (const file of markdownFiles) {
  const markdown = await readFile(resolve(root, file), "utf8");
  for (const target of relativeTargets(markdown)) {
    if (
      target.startsWith("#") ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }
    const path = target.split("#", 1)[0];
    if (!path) continue;
    try {
      await access(resolve(root, dirname(file), decodeURIComponent(path)));
    } catch {
      throw new Error(`${file} 包含失效路径：${target}`);
    }
  }
}

console.log(
  `开源文件校验通过：版本 ${[...packageVersions][0]}，schema ${schemaVersion}，${requiredFiles.length} 个必需文件`,
);
