import { cp, mkdtemp, mkdir, readFile, rm, symlink } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";

if (process.platform !== "darwin") {
  throw new Error("DMG 只能在 macOS 上生成。");
}

const config = JSON.parse(
  await readFile("apps/desktop/src-tauri/tauri.conf.json", "utf8"),
);
const productName = config.productName;
const version = config.version;
const requestedTarget = process.env.FOODLAB_BUILD_TARGET?.trim();
const target = requestedTarget === "x86_64-apple-darwin"
  ? { architecture: "x64", directory: "x86_64-apple-darwin" }
  : requestedTarget === "aarch64-apple-darwin"
    ? { architecture: "arm64", directory: "aarch64-apple-darwin" }
    : process.arch === "arm64"
      ? { architecture: "arm64", directory: null }
      : { architecture: "x64", directory: null };
if (requestedTarget && requestedTarget !== `${target.directory}`) {
  throw new Error(`不支持的 macOS 构建目标：${requestedTarget}`);
}
const architecture = target.architecture;
const bundleRoot = resolve(
  "apps/desktop/src-tauri/target",
  ...(target.directory ? [target.directory] : []),
  "release/bundle",
);
const appPath = join(bundleRoot, "macos", `${productName}.app`);
const dmgRoot = join(bundleRoot, "dmg");
const outputPath = join(
  dmgRoot,
  `food-rd-studio-${version}-macos-${architecture}.dmg`,
);
const distributionFiles = ["LICENSE", "NOTICE", "THIRD_PARTY_LICENSES.md"];
const runtimeLicenseRoot = resolve(
  "apps/desktop/src-tauri/generated/agent-runtime/licenses",
);

await mkdir(dmgRoot, { recursive: true });
const stagingRoot = await mkdtemp(join(dmgRoot, ".staging-"));

function run(command, args) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", rejectCommand);
    child.on("exit", (code) => {
      if (code === 0) {
        resolveCommand();
      } else {
        rejectCommand(new Error(`${command} 退出，状态码 ${code}`));
      }
    });
  });
}

try {
  await cp(appPath, join(stagingRoot, basename(appPath)), {
    recursive: true,
    preserveTimestamps: true,
  });
  for (const file of distributionFiles) {
    await cp(file, join(stagingRoot, basename(file)), {
      preserveTimestamps: true,
    });
  }
  await cp(runtimeLicenseRoot, join(stagingRoot, "Third-Party Licenses"), {
    recursive: true,
    preserveTimestamps: true,
  });
  await symlink("/Applications", join(stagingRoot, "Applications"));

  await run("hdiutil", [
    "create",
    "-volname",
    productName,
    "-srcfolder",
    stagingRoot,
    "-ov",
    "-format",
    "UDZO",
    outputPath,
  ]);
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}

console.log(`已生成 ${outputPath}`);
