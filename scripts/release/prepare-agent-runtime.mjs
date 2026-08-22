import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";

const NODE_VERSION = "24.19.0";
const AGENT_RUNTIME_VERSION = "0.1.0-rc.6";
const CODEX_VERSION = "0.148.0";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SOURCE = join(ROOT, "apps/desktop/src-tauri/agent-runtime");
const GENERATED = join(ROOT, "apps/desktop/src-tauri/generated/agent-runtime");
const BINARIES = join(ROOT, "apps/desktop/src-tauri/binaries");
const AUDITED_IGNORED_LIFECYCLE_SCRIPTS = new Map([
  ["node_modules/@deepseek-ai/dsh-subprocess-local", {
    version: "0.1.0-rc.8",
    scripts: { postinstall: "node scripts/ensure-spawn-helper.mjs" },
  }],
  ["node_modules/@google/genai", {
    version: "1.52.0",
    scripts: { preinstall: "echo 'preinstall: no-op'" },
  }],
  ["node_modules/koffi", {
    version: "3.1.6",
    scripts: { install: "node ./cnoke.cjs -P . -D src/koffi --prebuild --release" },
  }],
  ["node_modules/node-pty", {
    version: "1.2.0-beta.15",
    scripts: {
      install: "node scripts/prebuild.js || node-gyp rebuild",
      postinstall: "node scripts/post-install.js",
    },
  }],
  ["node_modules/protobufjs", {
    version: "7.6.5",
    scripts: { postinstall: "node scripts/postinstall" },
  }],
]);

const targets = {
  "darwin-arm64": {
    archive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    sha256: "8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d",
    triple: "aarch64-apple-darwin",
    nodeExecutable: "bin/node",
    npmCli: "lib/node_modules/npm/bin/npm-cli.js",
    codexPackage: "@openai/codex-darwin-arm64",
    codexExecutable: "vendor/aarch64-apple-darwin/bin/codex",
    ptyFiles: [
      "node_modules/node-pty/prebuilds/darwin-arm64/pty.node",
      "node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
    ],
    koffiFile: "node_modules/@koromix/koffi-darwin-arm64/darwin_arm64/koffi.node",
  },
  "darwin-x64": {
    archive: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    sha256: "d1b5e999db158c62fe8f7267a4476b035d8bd93b1a605bac24a3f0dd166e3316",
    triple: "x86_64-apple-darwin",
    nodeExecutable: "bin/node",
    npmCli: "lib/node_modules/npm/bin/npm-cli.js",
    codexPackage: "@openai/codex-darwin-x64",
    codexExecutable: "vendor/x86_64-apple-darwin/bin/codex",
    ptyFiles: [
      "node_modules/node-pty/prebuilds/darwin-x64/pty.node",
      "node_modules/node-pty/prebuilds/darwin-x64/spawn-helper",
    ],
    koffiFile: "node_modules/@koromix/koffi-darwin-x64/darwin_x64/koffi.node",
  },
  "win32-x64": {
    archive: `node-v${NODE_VERSION}-win-x64.zip`,
    sha256: "57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73",
    triple: "x86_64-pc-windows-msvc",
    nodeExecutable: "node.exe",
    npmCli: "node_modules/npm/bin/npm-cli.js",
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

const targetKey = `${process.platform}-${process.arch}`;
if (!targets[targetKey]) {
  throw new Error("Ninka Agent 内置运行时仅支持 macOS arm64/x64 与 Windows x64 构建。");
}

const target = targets[targetKey];
const nodeBinary = join(
  BINARIES,
  `foodlab-agent-node-${target.triple}${process.platform === "win32" ? ".exe" : ""}`,
);
const packageLockPath = join(SOURCE, "package-lock.json");
const lockBytes = await readFile(packageLockPath);
const lockSha256 = sha256(lockBytes);
const expectedIdentity = {
  schemaVersion: 1,
  runtimeVersion: AGENT_RUNTIME_VERSION,
  nodeVersion: NODE_VERSION,
  operatingSystem: process.platform,
  architecture: process.arch,
  targetTriple: target.triple,
  nodeArchiveSha256: target.sha256,
  packageLockSha256: lockSha256,
};
const reuseVerifiedNode = process.env.FOODLAB_REUSE_VERIFIED_NODE === "1";
let previousManifest = null;
let previousNodeLicense = null;
if (reuseVerifiedNode) {
  try {
    previousManifest = JSON.parse(
      await readFile(join(GENERATED, "runtime-manifest.json"), "utf8"),
    );
    previousNodeLicense = await readFile(join(GENERATED, "licenses/NODE_LICENSE"));
  } catch {
    throw new Error("没有可复用的已验证 Node 运行时，请在允许联网的构建环境重试。");
  }
}

if (await isCurrent(expectedIdentity, nodeBinary)) {
  const currentManifestPath = join(GENERATED, "runtime-manifest.json");
  const currentManifest = JSON.parse(await readFile(currentManifestPath, "utf8"));
  if (process.platform === "darwin") {
    const nodeCodeDirectorySha256 = await signedNodeCodeDirectorySha256(nodeBinary);
    if (currentManifest.nodeCodeDirectorySha256 !== nodeCodeDirectorySha256) {
      currentManifest.nodeCodeDirectorySha256 = nodeCodeDirectorySha256;
      currentManifest.createdAt = new Date().toISOString();
      await writeFile(
        currentManifestPath,
        `${JSON.stringify(currentManifest, null, 2)}\n`,
      );
    }
  }
  if (await isCurrent(expectedIdentity, nodeBinary)) {
    console.log(`FoodLab Agent 运行时已就绪：${process.arch}`);
    process.exit(0);
  }
}

assertLifecycleScriptsAreAudited(JSON.parse(lockBytes.toString("utf8")));
const temporary = await mkdtemp(join(tmpdir(), "foodlab-agent-runtime-"));

try {
  let installNode;
  let npmCli;
  let nodeLicense;
  if (reuseVerifiedNode) {
    if (
      previousManifest.nodeVersion !== NODE_VERSION
      || previousManifest.architecture !== process.arch
      || previousManifest.nodeArchiveSha256 !== target.sha256
      || sha256(await readFile(nodeBinary)) !== previousManifest.nodeBinarySha256
    ) {
      throw new Error("本地 Node 运行时的版本、架构或校验值不匹配。");
    }
    installNode = nodeBinary;
    npmCli = process.env.npm_execpath;
    nodeLicense = previousNodeLicense;
    if (!npmCli) throw new Error("当前 npm 启动路径不可用。");
  } else {
    const archivePath = join(temporary, target.archive);
    await download(
      `https://nodejs.org/dist/v${NODE_VERSION}/${target.archive}`,
      archivePath,
    );
    const archiveBytes = await readFile(archivePath);
    if (sha256(archiveBytes) !== target.sha256) {
      throw new Error(`Node ${NODE_VERSION} ${process.arch} 校验失败。`);
    }
    await run(
      "tar",
      [target.archive.endsWith(".zip") ? "-xf" : "-xzf", archivePath, "-C", temporary],
    );
    const extracted = join(temporary, target.archive.replace(/\.(?:tar\.gz|zip)$/, ""));
    installNode = join(extracted, target.nodeExecutable);
    npmCli = join(extracted, target.npmCli);
    nodeLicense = await readFile(join(extracted, "LICENSE"));
  }

  await rm(GENERATED, { recursive: true, force: true });
  await mkdir(GENERATED, { recursive: true });
  await copyFile(join(SOURCE, "package.json"), join(GENERATED, "package.json"));
  await copyFile(packageLockPath, join(GENERATED, "package-lock.json"));
  await run(
    installNode,
    [
      npmCli,
      "ci",
      "--omit=dev",
      "--include=optional",
      "--ignore-scripts",
      "--audit=false",
      "--fund=false",
      ...(reuseVerifiedNode ? ["--offline"] : []),
    ],
    GENERATED,
  );
  await verifyIgnoredLifecycleScripts(installNode, target);

  await mkdir(BINARIES, { recursive: true });
  if (!reuseVerifiedNode) {
    await copyFile(installNode, nodeBinary);
    if (process.platform !== "win32") await chmod(nodeBinary, 0o755);
  }

  const licenses = join(GENERATED, "licenses");
  await mkdir(licenses, { recursive: true });
  await writeFile(join(licenses, "NODE_LICENSE"), nodeLicense);
  await copyUpstreamNotices(
    join(GENERATED, "node_modules/@deepseek-ai/dsh"),
    licenses,
  );
  await collectDependencyNotices(
    join(GENERATED, "node_modules"),
    join(licenses, "npm"),
  );

  const criticalFiles = {};
  for (const relative of [
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
  ]) {
    const bytes = await readFile(join(GENERATED, relative));
    criticalFiles[relative] = sha256(bytes);
  }

  const nodeBinarySha256 = sha256(await readFile(nodeBinary));
  const manifest = {
    ...expectedIdentity,
    nodeBinarySha256,
    ...(process.platform === "darwin"
      ? { nodeCodeDirectorySha256: await signedNodeCodeDirectorySha256(nodeBinary) }
      : {}),
    criticalFiles,
    components: {
      node: NODE_VERSION,
      foodlabAgentRuntime: AGENT_RUNTIME_VERSION,
      codexAppServer: CODEX_VERSION,
      dshWebFrontend: JSON.parse(await readFile(
        join(GENERATED, "node_modules/@deepseek-ai/dsh-web-frontend/package.json"),
        "utf8",
      )).version,
    },
    createdAt: new Date().toISOString(),
  };
  await writeFile(
    join(GENERATED, "runtime-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  console.log(`已准备 FoodLab Agent 内置运行时：${process.arch}`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

async function isCurrent(identity, binary) {
  try {
    const manifest = JSON.parse(
      await readFile(join(GENERATED, "runtime-manifest.json"), "utf8"),
    );
    if (!Object.entries(identity).every(([key, value]) => manifest[key] === value)) {
      return false;
    }
    if (sha256(await readFile(binary)) !== manifest.nodeBinarySha256) {
      return false;
    }
    const criticalFiles = manifest.criticalFiles;
    if (!criticalFiles || Object.keys(criticalFiles).length === 0) {
      return false;
    }
    for (const [relative, expected] of Object.entries(criticalFiles)) {
      if (relative.startsWith("/") || relative.includes("..")) return false;
      if (sha256(await readFile(join(GENERATED, relative))) !== expected) return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function signedNodeCodeDirectorySha256(binary) {
  if (process.platform !== "darwin") {
    throw new Error("只有 macOS 运行时需要计算 Node 签名摘要。");
  }
  const temporary = await mkdtemp(join(tmpdir(), "foodlab-agent-node-signature-"));
  const staged = join(temporary, "foodlab-agent-node");
  try {
    await copyFile(binary, staged);
    await chmod(staged, 0o755);
    spawnSync("codesign", ["--remove-signature", staged], {
      encoding: "utf8",
      stdio: "pipe",
    });
    await run("codesign", [
      "--force",
      "--sign",
      "-",
      "--timestamp=none",
      staged,
    ]);
    const inspected = spawnSync("codesign", ["-d", "--verbose=4", staged], {
      encoding: "utf8",
      stdio: "pipe",
    });
    if (inspected.status !== 0) {
      throw new Error("无法读取内置 Node 的签名摘要。");
    }
    const output = `${inspected.stdout ?? ""}\n${inspected.stderr ?? ""}`;
    const match = output.match(/CandidateCDHashFull sha256=([a-f0-9]{64})/i);
    if (!match) throw new Error("内置 Node 的签名摘要格式无效。");
    return match[1].toLowerCase();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

function assertLifecycleScriptsAreAudited(lock) {
  const offenders = Object.entries(lock.packages ?? {})
    .filter(([, value]) => value?.hasInstallScript);
  const actualPaths = new Set(offenders.map(([path]) => path));
  const unexpected = offenders.filter(([path, value]) => {
    const audited = AUDITED_IGNORED_LIFECYCLE_SCRIPTS.get(path);
    return !audited || audited.version !== value.version;
  });
  const missing = [...AUDITED_IGNORED_LIFECYCLE_SCRIPTS.keys()]
    .filter((path) => !actualPaths.has(path));
  if (unexpected.length || missing.length) {
    throw new Error(
      `Agent 运行时生命周期脚本审计不匹配。新增或变更：${unexpected.map(([path]) => path).join(", ") || "无"}；缺失：${missing.join(", ") || "无"}`,
    );
  }
}

async function verifyIgnoredLifecycleScripts(node, runtimeTarget) {
  for (const [packagePath, audited] of AUDITED_IGNORED_LIFECYCLE_SCRIPTS) {
    const packageJson = JSON.parse(
      await readFile(join(GENERATED, packagePath, "package.json"), "utf8"),
    );
    if (packageJson.version !== audited.version) {
      throw new Error(`生命周期脚本依赖版本发生变化：${packageJson.name}`);
    }
    for (const phase of ["preinstall", "install", "postinstall"]) {
      const expected = audited.scripts[phase];
      const actual = packageJson.scripts?.[phase];
      if (actual !== expected) {
        throw new Error(`生命周期脚本文本发生变化：${packageJson.name} ${phase}`);
      }
    }
  }

  for (const relative of runtimeTarget.ptyFiles) {
    await access(join(GENERATED, relative));
  }
  if (process.platform === "darwin") {
    const spawnHelper = join(
      GENERATED,
      runtimeTarget.ptyFiles.find((relative) => relative.endsWith("/spawn-helper")),
    );
    if (((await stat(spawnHelper)).mode & 0o111) === 0) {
      throw new Error("node-pty 预编译启动器不可执行；生命周期脚本仍保持禁用。");
    }
  }
  await access(join(GENERATED, runtimeTarget.koffiFile));
  if (process.platform === "win32") {
    await run(node, ["-e", String.raw`
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
    `], GENERATED);
  } else {
    await run(node, ["-e", "require('node-pty'); require('koffi')"], GENERATED);
  }
}

async function download(url, destination) {
  const response = await fetch(url, { redirect: "error" });
  if (!response.ok || !response.body) {
    throw new Error(`无法下载 ${basename(destination)}：HTTP ${response.status}`);
  }
  await pipeline(response.body, createWriteStream(destination, { mode: 0o600 }));
}

async function copyUpstreamNotices(packageRoot, destination) {
  const entries = await readdir(packageRoot);
  const candidates = entries.filter((name) =>
    /^(license|third_party_notices)(\..+)?$/i.test(name),
  );
  if (!candidates.some((name) => /^license(\..+)?$/i.test(name))) {
    throw new Error("Agent 运行时 npm 包未包含可分发的许可证文件。");
  }
  for (const name of candidates) {
    const source = join(packageRoot, name);
    if ((await stat(source)).isFile()) {
      await cp(source, join(destination, `AGENT_RUNTIME_${name}`));
    }
  }
}

async function collectDependencyNotices(modulesRoot, destination) {
  const visited = new Set();

  async function scan(root) {
    if (visited.has(root)) return;
    visited.add(root);
    const entries = await readdir(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const candidates = entry.name.startsWith("@")
        ? (await readdir(join(root, entry.name), { withFileTypes: true }))
            .filter((child) => child.isDirectory())
            .map((child) => join(root, entry.name, child.name))
        : [join(root, entry.name)];
      for (const packageRoot of candidates) {
        const manifestPath = join(packageRoot, "package.json");
        let manifest;
        try {
          manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        } catch {
          // A directory without a package manifest is not an npm package root.
          continue;
        }
        const legalFiles = (await readdir(packageRoot, { withFileTypes: true }))
          .filter((file) => file.isFile() && /^(licen[cs]e|notice|copyright|third[_-]party)/i.test(file.name));
        if (legalFiles.length) {
          const packageName = `${manifest.name ?? basename(packageRoot)}@${manifest.version ?? "unknown"}`
            .replaceAll("/", "__");
          const packageDestination = join(destination, packageName);
          await mkdir(packageDestination, { recursive: true });
          for (const file of legalFiles) {
            await copyFile(
              join(packageRoot, file.name),
              join(packageDestination, file.name),
            );
          }
        }
        const nested = join(packageRoot, "node_modules");
        try {
          await access(nested);
          await scan(nested);
        } catch {
          // Most packages are hoisted and have no nested dependency directory.
        }
      }
    }
  }

  await scan(modulesRoot);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function run(command, args, cwd = ROOT) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", rejectRun);
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} 退出，状态码 ${code}`));
    });
  });
}
