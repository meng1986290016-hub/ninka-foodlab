import { spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

function normalizeLicense(value) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === "string" ? item : item?.type))
      .filter(Boolean);
    if (items.length > 0) return items.join(" OR ");
  }
  if (value && typeof value === "object" && typeof value.type === "string") {
    return value.type;
  }
  return "UNKNOWN";
}

async function nodePackages() {
  const storeRoot = "node_modules/.pnpm";
  const packages = new Map();

  for (const storeEntry of await readdir(storeRoot)) {
    const modulesRoot = join(storeRoot, storeEntry, "node_modules");
    if (!existsSync(modulesRoot)) continue;

    for (const entry of await readdir(modulesRoot, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const candidates = entry.name.startsWith("@")
        ? (await readdir(join(modulesRoot, entry.name))).map((child) =>
            join(modulesRoot, entry.name, child),
          )
        : [join(modulesRoot, entry.name)];

      for (const directory of candidates) {
        const manifestPath = join(directory, "package.json");
        if (!existsSync(manifestPath)) continue;
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        if (!manifest.name || !manifest.version) continue;
        packages.set(`${manifest.name}@${manifest.version}`, {
          name: manifest.name,
          version: manifest.version,
          license: normalizeLicense(manifest.license ?? manifest.licenses),
        });
      }
    }
  }

  return [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
      "en",
    ),
  );
}

async function embeddedRuntimePackages() {
  const modulesRoot =
    "apps/desktop/src-tauri/generated/agent-runtime/node_modules";
  if (!existsSync(modulesRoot)) {
    throw new Error("缺少已生成的 FoodLab Agent 运行时，请先执行 pnpm agent-runtime:prepare");
  }
  const packages = new Map();
  const visited = new Set();

  async function scan(root) {
    if (visited.has(root) || !existsSync(root)) return;
    visited.add(root);
    for (const entry of await readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const candidates = entry.name.startsWith("@")
        ? (await readdir(join(root, entry.name), { withFileTypes: true }))
            .filter((child) => child.isDirectory())
            .map((child) => join(root, entry.name, child.name))
        : [join(root, entry.name)];
      for (const directory of candidates) {
        const manifestPath = join(directory, "package.json");
        if (!existsSync(manifestPath)) continue;
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        if (manifest.name && manifest.version) {
          packages.set(`${manifest.name}@${manifest.version}`, {
            name: manifest.name,
            version: manifest.version,
            license: normalizeLicense(manifest.license ?? manifest.licenses),
          });
        }
        await scan(join(directory, "node_modules"));
      }
    }
  }

  await scan(modulesRoot);
  packages.set("Node.js@24.19.0", {
    name: "Node.js",
    version: "24.19.0",
    license: "MIT and bundled third-party licenses; see NODE_LICENSE",
  });
  return [...packages.values()].sort((left, right) =>
    `${left.name}@${left.version}`.localeCompare(
      `${right.name}@${right.version}`,
      "en",
    ),
  );
}

function rustPackages() {
  const result = spawnSync(
    "cargo",
    [
      "metadata",
      "--locked",
      "--format-version=1",
      "--manifest-path",
      "apps/desktop/src-tauri/Cargo.toml",
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(result.stderr || "cargo metadata 失败");
  }

  const metadata = JSON.parse(result.stdout);
  return metadata.packages
    .filter((item) => item.source !== null)
    .map((item) => ({
      name: item.name,
      version: item.version,
      license: item.license ?? `License file: ${item.license_file ?? "UNKNOWN"}`,
    }))
    .sort((left, right) =>
      `${left.name}@${left.version}`.localeCompare(
        `${right.name}@${right.version}`,
        "en",
      ),
    );
}

function table(packages) {
  return [
    "| Package | Version | Declared license |",
    "| --- | --- | --- |",
    ...packages.map(
      (item) =>
        `| \`${item.name.replaceAll("|", "\\|")}\` | \`${item.version}\` | ${item.license.replaceAll("|", "\\|")} |`,
    ),
  ].join("\n");
}

const javascript = await nodePackages();
const embeddedRuntime = await embeddedRuntimePackages();
const rust = rustPackages();
const missing = [...javascript, ...embeddedRuntime, ...rust].filter(
  (item) => item.license === "UNKNOWN" || item.license.endsWith("UNKNOWN"),
);
if (missing.length > 0) {
  throw new Error(
    `存在未声明许可证的依赖：${missing.map((item) => `${item.name}@${item.version}`).join(", ")}`,
  );
}

const output = `# Third-party license inventory

This file is generated from the installed pnpm dependency store and Cargo metadata locked by this checkout. It records declared license expressions for review; it does not replace license texts or attribution notices that a dependency may require in a source or binary distribution.

Because JavaScript packages can be platform-specific, release workflows regenerate this file on each target platform. The inventory committed in the source tree represents the platform on which it was last generated.

Regenerate from the repository root with:

\`\`\`bash
pnpm licenses:generate
\`\`\`

## JavaScript dependencies (${javascript.length})

${table(javascript)}

## Embedded FoodLab Agent runtime (${embeddedRuntime.length})

The corresponding license texts and attribution notices are included in the
application bundle and in the DMG folder named \`Third-Party Licenses\`.

${table(embeddedRuntime)}

## Rust dependencies (${rust.length})

${table(rust)}
`;

await writeFile("THIRD_PARTY_LICENSES.md", output, "utf8");
console.log(
  `已生成第三方许可证清单：JavaScript ${javascript.length} 个，Agent 运行时 ${embeddedRuntime.length} 个，Rust ${rust.length} 个`,
);
