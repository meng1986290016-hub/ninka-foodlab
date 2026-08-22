import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const EXPECTED_NODE_VERSION = "24.19.0";
const EXPECTED_RUNTIME_VERSION = "0.1.0-rc.6";
const TARGETS = {
  "aarch64-apple-darwin": {
    operatingSystem: "darwin",
    architecture: "arm64",
    archiveSha256: "8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d",
    codexPackage: "@openai/codex-darwin-arm64",
    codexExecutable: "vendor/aarch64-apple-darwin/bin/codex",
    ptyFiles: [
      "node_modules/node-pty/prebuilds/darwin-arm64/pty.node",
      "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
    ],
    koffiFile: "node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node",
  },
  "x86_64-apple-darwin": {
    operatingSystem: "darwin",
    architecture: "x64",
    archiveSha256: "d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316",
    codexPackage: "@openai/codex-darwin-x64",
    codexExecutable: "vendor/x86_64-apple-darwin/bin/codex",
    ptyFiles: [
      "node_modules/node-pty/prebuilds/darwin-x64/pty.node",
      "node_modules/node-pty/prebuilds/darwin-x64/spawn-helper",
    ],
    koffiFile: "node_modules/@koromix/koffi-darwin-x64/darwin_x64/koffi.node",
  },
  "x86_64-pc-windows-msvc": {
    operatingSystem: "win32",
    architecture: "x64",
    archiveSha256: "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73",
    codexPackage: "@openai/codex-win32-x64",
    codexExecutable: "vendor/x86_64-pc-windows-msvc/bin/codex.exe",
    ptyFiles: [
      "node_modules/node-pty/prebuilds/win32-x64/conpty.node",
      "node_modules/node-pty/prebuilds/win32-x64/conpty_console_list.node",
      "node_modules/node-pty/prebuilds/win32-x64/conpty/conpty.dll",
      "node_modules/node-pty/prebuilds/win32-x64/conpty/OpenConsole.exe",
    ],
    koffiFile: "node_modules/@koromix/koffi-win32-x64/win32_x64/koffi.node",
  },
};

const requestedTarget = process.env.FOODLAB_BUILD_TARGET?.trim();
const nativeTarget = process.platform === "win32"
  ? process.arch === "x64" ? "x86_64-pc-windows-msvc" : null
  : process.platform === "darwin"
    ? process.arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
    : null;
const expectedTriple = requestedTarget || nativeTarget;
const target = TARGETS[expectedTriple];
if (!target || target.operatingSystem !== process.platform) {
  throw new Error(`不支持的安装包构建目标：${expectedTriple ?? `${process.platform}-${process.arch}`}`);
}

const config = JSON.parse(
  await readFile("apps/desktop/src-tauri/tauri.conf.json", "utf8"),
);
let appPath;
let nodeBinary;
let runtimeRoot;
if (target.operatingSystem === "darwin") {
  appPath = resolve(
    process.argv[2]
      ?? `apps/desktop/src-tauri/target/${requestedTarget ? `${requestedTarget}/` : ""}release/bundle/macos/${config.productName}.app`,
  );
  nodeBinary = join(appPath, "Contents/MacOS/foodlab-agent-node");
  runtimeRoot = join(appPath, "Contents/Resources/agent-runtime");
} else {
  appPath = resolve(
    process.argv[2]
      ?? process.env.FOODLAB_WINDOWS_APP_ROOT
      ?? "apps/desktop/src-tauri/target/release",
  );
  nodeBinary = join(appPath, "foodlab-agent-node.exe");
  runtimeRoot = join(appPath, "agent-runtime");
}

const manifest = JSON.parse(
  await readFile(join(runtimeRoot, "runtime-manifest.json"), "utf8"),
);
if (
  manifest.schemaVersion !== 1
  || manifest.runtimeVersion !== EXPECTED_RUNTIME_VERSION
  || manifest.nodeVersion !== EXPECTED_NODE_VERSION
  || manifest.operatingSystem !== target.operatingSystem
  || manifest.architecture !== target.architecture
  || manifest.targetTriple !== expectedTriple
  || manifest.nodeArchiveSha256 !== target.archiveSha256
) {
  throw new Error("Agent 运行时清单的版本、系统或目标架构不匹配");
}
if (!isSha256(manifest.packageLockSha256) || !isSha256(manifest.nodeBinarySha256)) {
  throw new Error("Agent 运行时清单摘要无效");
}
if (
  target.operatingSystem === "darwin"
    ? !isSha256(manifest.nodeCodeDirectorySha256)
    : manifest.nodeCodeDirectorySha256 !== undefined
) {
  throw new Error("Agent 运行时签名摘要与目标系统不匹配");
}

await access(nodeBinary);
const nodeVersion = execFileSync(nodeBinary, ["--version"], {
  encoding: "utf8",
  env: runtimeEnvironment({ PATH: "" }),
}).trim();
if (nodeVersion !== `v${EXPECTED_NODE_VERSION}`) {
  throw new Error(`内置 Node 无法独立运行：${nodeVersion}`);
}

if (target.operatingSystem === "darwin") {
  const architectures = execFileSync("lipo", ["-archs", nodeBinary], {
    encoding: "utf8",
  }).trim().split(/\s+/);
  const expectedMachArch = target.architecture === "arm64" ? "arm64" : "x86_64";
  if (!architectures.includes(expectedMachArch)) {
    throw new Error(`内置 Node 二进制架构错误：${architectures.join(", ")}`);
  }
} else {
  assertWindowsX64Pe(await readFile(nodeBinary));
  for (const executable of ["food-rd-desktop.exe", "food_rd_mcp.exe"]) {
    const executablePath = join(appPath, executable);
    await access(executablePath);
    assertWindowsX64Pe(await readFile(executablePath));
  }
}

const rawNodeSha256 = sha256(await readFile(nodeBinary));
if (rawNodeSha256 !== manifest.nodeBinarySha256) {
  if (target.operatingSystem !== "darwin") {
    throw new Error("内置 Node 文件校验失败");
  }
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
  `node_modules/${target.codexPackage}/package.json`,
  `node_modules/${target.codexPackage}/${target.codexExecutable}`,
  "node_modules/node-pty/package.json",
  ...target.ptyFiles,
  "node_modules/koffi/package.json",
  target.koffiFile,
];
for (const relative of requiredCriticalFiles) {
  if (!manifest.criticalFiles?.[relative]) {
    throw new Error(`Agent 运行时清单缺少关键文件：${relative}`);
  }
}
for (const [relative, expected] of Object.entries(manifest.criticalFiles)) {
  if (
    relative.startsWith("/")
    || relative.startsWith("\\")
    || /^[a-z]:/i.test(relative)
    || relative.includes("..")
  ) {
    throw new Error("Agent 运行时清单包含无效路径");
  }
  const actual = sha256(await readFile(join(runtimeRoot, relative)));
  if (actual !== expected) throw new Error(`Agent 关键文件校验失败：${relative}`);
}

if (target.operatingSystem === "win32") {
  const nativeCheck = spawnSync(nodeBinary, ["-e", String.raw`
    const pty = require('node-pty');
    const koffi = require('koffi');
    const kernel32 = koffi.load('kernel32.dll');
    const getTickCount = kernel32.func('uint32_t __stdcall GetTickCount(void)');
    if (!Number.isInteger(getTickCount())) throw new Error('koffi smoke test failed');
    const shell = process.env.ComSpec || 'cmd.exe';
    const child = pty.spawn(shell, ['/d', '/s', '/c', 'exit 0'], {
      cols: 80,
      rows: 24,
      cwd: process.cwd(),
      env: process.env,
    });
    const timer = setTimeout(() => {
      child.kill();
      process.exit(1);
    }, 10000);
    child.onExit(({ exitCode }) => {
      clearTimeout(timer);
      process.exit(exitCode === 0 ? 0 : 1);
    });
  `], {
    cwd: runtimeRoot,
    encoding: "utf8",
    env: runtimeEnvironment({ PATH: "" }),
    timeout: 20_000,
  });
  if (nativeCheck.status !== 0) {
    throw new Error(
      nativeCheck.stderr || nativeCheck.error?.message || "Agent Windows 原生依赖校验失败",
    );
  }
}

const verificationRoot = join(
  process.env.RUNNER_TEMP ?? tmpdir(),
  "ninka-agent-runtime-verify",
);
const cli = join(runtimeRoot, "node_modules/@deepseek-ai/dsh/lib/bin.js");
const cliCheck = spawnSync(nodeBinary, [cli, "--help"], {
  cwd: runtimeRoot,
  encoding: "utf8",
  env: runtimeEnvironment({
    PATH: "",
    DSH_HOME: join(verificationRoot, "dsh"),
  }),
  timeout: 20_000,
});
if (cliCheck.status !== 0) {
  throw new Error(cliCheck.stderr || cliCheck.error?.message || "Agent CLI 启动校验失败");
}

const codexCli = join(runtimeRoot, "node_modules/@openai/codex/bin/codex.js");
const codexCheck = spawnSync(nodeBinary, [codexCli, "app-server", "--help"], {
  cwd: runtimeRoot,
  encoding: "utf8",
  env: runtimeEnvironment({
    PATH: target.operatingSystem === "darwin" ? "/usr/bin:/bin" : "",
    CODEX_HOME: join(verificationRoot, "codex"),
    HOME: join(verificationRoot, "codex-home"),
    ...(target.operatingSystem === "win32"
      ? { USERPROFILE: join(verificationRoot, "codex-home") }
      : {}),
  }),
  timeout: 20_000,
});
if (codexCheck.status !== 0) {
  throw new Error(codexCheck.stderr || codexCheck.error?.message || "Agent 辅助运行组件启动校验失败");
}

console.log(`已验证 ${appPath} 内的 Ninka Agent 运行时（${expectedTriple}）`);

function runtimeEnvironment(overrides) {
  const retained = target.operatingSystem === "win32"
    ? ["SystemRoot", "WINDIR", "TEMP", "TMP", "PATHEXT", "ComSpec"]
    : ["TMPDIR"];
  const environment = {};
  for (const name of retained) {
    if (process.env[name]) environment[name] = process.env[name];
  }
  return { ...environment, ...overrides };
}

function assertWindowsX64Pe(bytes) {
  if (bytes.length < 0x40 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    throw new Error("内置 Node 不是有效的 Windows 可执行文件");
  }
  const peOffset = bytes.readUInt32LE(0x3c);
  if (
    peOffset + 6 > bytes.length
    || bytes.toString("ascii", peOffset, peOffset + 4) !== "PE\0\0"
    || bytes.readUInt16LE(peOffset + 4) !== 0x8664
  ) {
    throw new Error("内置 Node 不是 Windows x64 架构");
  }
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
