import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const EXPECTED_NODE_VERSION = "24.19.0";
const EXPECTED_RUNTIME_VERSION = "0.1.0-rc.6";
if (process.platform !== "darwin" || !["arm64", "x64"].includes(process.arch)) {
  throw new Error("FoodLab Agent 安装包校验仅支持 macOS arm64/x64。");
}
const requestedTarget = process.env.FOODLAB_BUILD_TARGET?.trim();
if (
  requestedTarget
  && !["aarch64-apple-darwin", "x86_64-apple-darwin"].includes(requestedTarget)
) {
  throw new Error(`不支持的 macOS 构建目标：${requestedTarget}`);
}
const expectedArchitecture = requestedTarget === "x86_64-apple-darwin"
  ? "x64"
  : requestedTarget === "aarch64-apple-darwin"
    ? "arm64"
    : process.arch === "arm64" ? "arm64" : "x64";
const expectedTriple = expectedArchitecture === "arm64"
  ? "aarch64-apple-darwin"
  : "x86_64-apple-darwin";
const expectedArchiveSha256 = expectedArchitecture === "arm64"
  ? "8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d"
  : "d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316";
const config = JSON.parse(
  await readFile("apps/desktop/src-tauri/tauri.conf.json", "utf8"),
);
const appPath = resolve(
  process.argv[2]
    ?? `apps/desktop/src-tauri/target/${requestedTarget ? `${requestedTarget}/` : ""}release/bundle/macos/${config.productName}.app`,
);
const nodeBinary = join(appPath, "Contents/MacOS/foodlab-agent-node");
const runtimeRoot = join(appPath, "Contents/Resources/agent-runtime");
const manifest = JSON.parse(
  await readFile(join(runtimeRoot, "runtime-manifest.json"), "utf8"),
);

if (manifest.nodeVersion !== EXPECTED_NODE_VERSION) {
  throw new Error(`内置 Node 版本不匹配：${manifest.nodeVersion}`);
}
if (manifest.runtimeVersion !== EXPECTED_RUNTIME_VERSION) {
  throw new Error(`Agent 运行时版本不匹配：${manifest.runtimeVersion}`);
}
if (manifest.architecture !== expectedArchitecture) {
  throw new Error(`Agent 运行时架构不匹配：${manifest.architecture}`);
}
if (manifest.schemaVersion !== 1 || manifest.targetTriple !== expectedTriple) {
  throw new Error("Agent 运行时清单格式或目标架构不匹配");
}
if (manifest.nodeArchiveSha256 !== expectedArchiveSha256) {
  throw new Error("内置 Node 来源校验值不匹配");
}
if (!/^[a-f0-9]{64}$/.test(manifest.packageLockSha256 ?? "")) {
  throw new Error("Agent 依赖锁摘要无效");
}

await access(nodeBinary);
const nodeVersion = execFileSync(nodeBinary, ["--version"], {
  encoding: "utf8",
  env: { PATH: "" },
}).trim();
if (nodeVersion !== `v${EXPECTED_NODE_VERSION}`) {
  throw new Error(`内置 Node 无法独立运行：${nodeVersion}`);
}

const architectures = execFileSync("lipo", ["-archs", nodeBinary], {
  encoding: "utf8",
}).trim().split(/\s+/);
const expectedMachArch = expectedArchitecture === "arm64" ? "arm64" : "x86_64";
if (!architectures.includes(expectedMachArch)) {
  throw new Error(`内置 Node 二进制架构错误：${architectures.join(", ")}`);
}

if (!/^[a-f0-9]{64}$/.test(manifest.nodeCodeDirectorySha256 ?? "")) {
  throw new Error("内置 Node 签名摘要无效");
}
if (sha256(await readFile(nodeBinary)) !== manifest.nodeBinarySha256) {
  const signatureCheck = spawnSync("codesign", ["--verify", "--strict", nodeBinary], {
    encoding: "utf8",
  });
  const signatureInfo = spawnSync("codesign", ["-d", "--verbose=4", nodeBinary], {
    encoding: "utf8",
  });
  const signatureOutput = `${signatureInfo.stdout ?? ""}\n${signatureInfo.stderr ?? ""}`;
  const signedDigest = signatureOutput.match(
    /CandidateCDHashFull sha256=([a-f0-9]{64})/i,
  )?.[1]?.toLowerCase();
  if (
    signatureCheck.status !== 0
    || signatureInfo.status !== 0
    || signedDigest !== manifest.nodeCodeDirectorySha256
  ) {
    throw new Error("内置 Node 文件或签名校验失败");
  }
}
const requiredCriticalFiles = [
  "package.json",
  "package-lock.json",
  "node_modules/@deepseek-ai/dsh/package.json",
  "node_modules/@deepseek-ai/dsh/lib/bin.js",
  "node_modules/@deepseek-ai/dsh-credentials-local/package.json",
  "node_modules/@deepseek-ai/dsh-web-frontend/package.json",
  "node_modules/@deepseek-ai/dsh-web-frontend/dist/index.html",
  "node_modules/@openai/codex/package.json",
  "node_modules/@openai/codex/bin/codex.js",
  `node_modules/@openai/codex-darwin-${expectedArchitecture}/package.json`,
  `node_modules/@openai/codex-darwin-${expectedArchitecture}/vendor/${expectedTriple}/bin/codex`,
  "node_modules/node-pty/package.json",
  `node_modules/node-pty/prebuilds/darwin-${expectedArchitecture}/pty.node`,
  `node_modules/node-pty/prebuilds/darwin-${expectedArchitecture}/spawn-helper`,
  "node_modules/koffi/package.json",
  `node_modules/@koromix/koffi-darwin-${expectedArchitecture}/darwin_${expectedArchitecture}/koffi.node`,
];
for (const relative of requiredCriticalFiles) {
  if (!manifest.criticalFiles?.[relative]) {
    throw new Error(`Agent 运行时清单缺少关键文件：${relative}`);
  }
}
for (const [relative, expected] of Object.entries(manifest.criticalFiles)) {
  if (relative.startsWith("/") || relative.includes("..")) {
    throw new Error("Agent 运行时清单包含无效路径");
  }
  const actual = sha256(await readFile(join(runtimeRoot, relative)));
  if (actual !== expected) throw new Error(`Agent 关键文件校验失败：${relative}`);
}

const cli = join(runtimeRoot, "node_modules/@deepseek-ai/dsh/lib/bin.js");
const cliCheck = spawnSync(nodeBinary, [cli, "--help"], {
  cwd: runtimeRoot,
  encoding: "utf8",
  env: {
    PATH: "",
    DSH_HOME: join(process.env.RUNNER_TEMP ?? "/tmp", "foodlab-agent-verify"),
  },
  timeout: 20_000,
});
if (cliCheck.status !== 0) {
  throw new Error(cliCheck.stderr || cliCheck.error?.message || "Agent CLI 启动校验失败");
}

const codexCli = join(runtimeRoot, "node_modules/@openai/codex/bin/codex.js");
const codexCheck = spawnSync(nodeBinary, [codexCli, "app-server", "--help"], {
  cwd: runtimeRoot,
  encoding: "utf8",
  env: {
    HOME: process.env.RUNNER_TEMP ?? "/tmp",
    PATH: "/usr/bin:/bin",
    CODEX_HOME: join(process.env.RUNNER_TEMP ?? "/tmp", "foodlab-chatgpt-verify"),
  },
  timeout: 20_000,
});
if (codexCheck.status !== 0) {
  throw new Error(codexCheck.stderr || codexCheck.error?.message || "ChatGPT 运行组件启动校验失败");
}

console.log(`已验证 ${appPath} 内的 FoodLab Agent 运行时（${expectedMachArch}）`);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
