import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const entryPoint = path.join(packageRoot, "src/remotion/index.ts");
const browserExecutable =
  process.platform === "darwin"
    ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    : null;

export async function runRemotion(args) {
  const executable = path.join(
    packageRoot,
    "node_modules/.bin",
    process.platform === "win32" ? "remotion.cmd" : "remotion",
  );
  await new Promise((resolve, reject) => {
    const child = spawn(
      executable,
      browserExecutable === null
        ? args
        : [...args, `--browser-executable=${browserExecutable}`],
      {
      cwd: packageRoot,
      env: process.env,
      stdio: "inherit",
      },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`Remotion 退出：code=${code ?? "null"}, signal=${signal ?? "null"}`));
    });
  });
}
