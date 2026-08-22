import { createHash } from "node:crypto";
import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve, sep } from "node:path";

const targetRoot = resolve("apps/desktop/src-tauri/target");
const outputRoot = resolve("dist/installers");
const supportedExtensions = new Set([".dmg", ".exe", ".msi"]);
const distributionFiles = [
  resolve("LICENSE"),
  resolve("NOTICE"),
  resolve("THIRD_PARTY_LICENSES.md"),
  resolve("docs/testing/README.md"),
];

async function walk(directory) {
  const pending = [directory];
  const files = [];
  while (pending.length) {
    const current = pending.pop();
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        // Installers are siblings of the application bundle. Descending into a
        // bundled runtime is both expensive and can misclassify dependency files.
        if (!entry.name.endsWith(".app") && !entry.name.endsWith(".dSYM")) {
          pending.push(path);
        }
      } else {
        files.push(path);
      }
    }
  }
  return files;
}

async function sha256(path) {
  const { createReadStream } = await import("node:fs");
  const hash = createHash("sha256");

  await new Promise((resolveStream, rejectStream) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", resolveStream);
    stream.on("error", rejectStream);
  });

  return hash.digest("hex");
}

const bundleMarker = `${sep}bundle${sep}`;
const artifacts = (await walk(targetRoot))
  .filter(
    (path) =>
      path.includes(bundleMarker) &&
      !basename(path).startsWith("rw.") &&
      supportedExtensions.has(extname(path).toLowerCase()),
  )
  .sort((left, right) => left.localeCompare(right));

if (artifacts.length === 0) {
  throw new Error(
    "没有找到桌面安装包。请先在对应系统运行 desktop:bundle:macos 或 desktop:bundle:windows。",
  );
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(outputRoot, { recursive: true });

const checksums = [];
for (const source of [...artifacts, ...distributionFiles]) {
  const fileName = basename(source);
  const destination = join(outputRoot, fileName);
  await copyFile(source, destination);
  checksums.push(`${await sha256(destination)}  ${fileName}`);
}

await writeFile(
  join(outputRoot, "SHA256SUMS.txt"),
  `${checksums.join("\n")}\n`,
  "utf8",
);

console.log(
  `已整理 ${artifacts.length} 个安装包和 ${distributionFiles.length} 个许可证文件到 dist/installers`,
);
for (const line of checksums) {
  console.log(line);
}
