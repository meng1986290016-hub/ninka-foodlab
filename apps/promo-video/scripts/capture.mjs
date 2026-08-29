import { execFileSync, spawn } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(packageRoot, "../..");
const captureDir = path.join(packageRoot, "public/captures");
const brandDir = path.join(packageRoot, "public/brand");
const chromeExecutable = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const baseUrl = "http://127.0.0.1:4175";
const prompt = "请基于现有原料，为低糖可可饮品生成待复核配方提案，并提示关键风险。";
const v02Prompt = "请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。";

await mkdir(captureDir, { recursive: true });
await mkdir(brandDir, { recursive: true });

async function writeTransparentBrandAsset(sourceName, outputName) {
  const source = await readFile(
    path.join(repoRoot, "assets/branding/source", sourceName),
    "utf8",
  );
  const withoutForestBackground = source.replaceAll(
    /<rect[^>]*fill="#153D36"\/>/g,
    "",
  );
  await writeFile(
    path.join(brandDir, outputName),
    withoutForestBackground,
    "utf8",
  );
}

await Promise.all([
  copyFile(
    path.join(repoRoot, "assets/branding/source/ninka-symbol-color-dark.svg"),
    path.join(brandDir, "ninka-symbol-color-dark.svg"),
  ),
  copyFile(
    path.join(repoRoot, "assets/branding/source/ninka-lockup-horizontal-dark.svg"),
    path.join(brandDir, "ninka-lockup-horizontal-dark.svg"),
  ),
  copyFile(
    path.join(repoRoot, "assets/branding/fonts/Manrope-VariableFont_wght.ttf"),
    path.join(brandDir, "Manrope-VariableFont_wght.ttf"),
  ),
  writeTransparentBrandAsset(
    "ninka-symbol-color-dark.svg",
    "ninka-symbol-color-transparent.svg",
  ),
  writeTransparentBrandAsset(
    "ninka-lockup-horizontal-dark.svg",
    "ninka-lockup-horizontal-transparent.svg",
  ),
]);

const viteExecutable = path.join(
  packageRoot,
  "node_modules/.bin",
  process.platform === "win32" ? "vite.cmd" : "vite",
);
const server = spawn(viteExecutable, ["--host", "127.0.0.1", "--port", "4175"], {
  cwd: packageRoot,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
server.stdout.on("data", (chunk) => process.stdout.write(chunk));
server.stderr.on("data", (chunk) => process.stderr.write(chunk));

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // The local capture server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("宣传片演示服务器未能在 20 秒内启动");
}

async function withPage(browser, query, ready, action, output) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    colorScheme: "dark",
    reducedMotion: "reduce",
    serviceWorkers: "block",
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === baseUrl) {
      await route.continue();
      return;
    }
    await route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  await page.goto(`${baseUrl}/?${query}`, { waitUntil: "networkidle" });
  await ready(page);
  if (action) await action(page);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(captureDir, output), fullPage: false });
  await context.close();
}

let browser;
try {
  await waitForServer();
  browser = await chromium.launch({
    executablePath: chromeExecutable,
    headless: true,
    args: ["--font-render-hinting=none"],
  });

  await withPage(
    browser,
    "surface=ingredients",
    (page) => page.getByRole("button", { name: "查看 可可粉 的具体原料" }).waitFor(),
    async (page) => {
      await page.getByRole("button", { name: "查看 可可粉 的具体原料" }).click();
      await page
        .getByRole("table", { name: "可可粉的具体原料列表" })
        .waitFor();
    },
    "ingredients.png",
  );
  await withPage(
    browser,
    "surface=ingredients",
    (page) => page.getByRole("button", { name: "查看 可可粉 的具体原料" }).waitFor(),
    async (page) => {
      await page.getByRole("button", { name: "查看 可可粉 的具体原料" }).click();
      await page
        .getByRole("button", {
          name: "编辑 可可粉 · 演示供应商 B · 低脂可可粉 CP-10",
        })
        .click();
      const dialog = page.getByRole("dialog", { name: "编辑供应商版本" });
      await dialog.waitFor();
      await dialog.getByRole("tab", { name: "营养成分" }).click();
      await dialog.locator(".nutrition-editor").waitFor();
    },
    "ingredients-nutrition.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=input",
    (page) => page.getByRole("textbox", { name: "给 Ninka Agent 发消息" }).waitFor(),
    (page) => page.getByRole("textbox", { name: "给 Ninka Agent 发消息" }).fill(prompt),
    "agent-input.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=progress",
    (page) => page.getByText("正在处理…").waitFor(),
    null,
    "agent-progress.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=result",
    (page) => page.getByText("低糖可可饮品（演示）").waitFor(),
    null,
    "agent-result.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=v02-capabilities",
    (page) => page.getByText("你能帮我干些什么？").waitFor(),
    null,
    "agent-v02-capabilities.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=v02-input",
    (page) => page.getByRole("textbox", { name: "给 Ninka Agent 发消息" }).waitFor(),
    (page) => page.getByRole("textbox", { name: "给 Ninka Agent 发消息" }).fill(v02Prompt),
    "agent-v02-input.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=v02-progress",
    (page) => page.getByText("正在处理…").waitFor(),
    null,
    "agent-v02-progress.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=v02-result",
    (page) => page.getByText("复配稳定剂").waitFor(),
    null,
    "agent-v02-result.png",
  );
  await withPage(
    browser,
    "surface=agent&promoStage=v02-result",
    (page) => page.getByText("复配稳定剂").waitFor(),
    async (page) => {
      await page.locator(".agent-conversation-log").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.waitForTimeout(120);
    },
    "agent-v02-result-detail.png",
  );
  await withPage(
    browser,
    "surface=workbench",
    (page) => page.getByRole("textbox", { name: "可可粉用量" }).waitFor(),
    null,
    "workbench-before.png",
  );
  await withPage(
    browser,
    "surface=workbench",
    (page) => page.getByRole("textbox", { name: "可可粉用量" }).waitFor(),
    async (page) => {
      const input = page.getByRole("textbox", { name: "可可粉用量" });
      await input.fill("32");
      await input.blur();
      await page.waitForTimeout(900);
    },
    "workbench-after.png",
  );
  await withPage(
    browser,
    "surface=label",
    (page) => page.locator(".nutrition-facts-sheet tbody tr").first().waitFor(),
    null,
    "label.png",
  );

  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const workspaceDirty = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim().length > 0;
  await writeFile(
    path.join(captureDir, "manifest.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        sourceRevision: revision,
        workspaceDirty,
        source: "latest workspace source through isolated PromoDemoApi",
        privacy: "synthetic demo data only; no SQLite, model credentials, or external network",
        files: [
          "ingredients.png",
          "ingredients-nutrition.png",
          "agent-input.png",
          "agent-progress.png",
          "agent-result.png",
          "agent-v02-capabilities.png",
          "agent-v02-input.png",
          "agent-v02-progress.png",
          "agent-v02-result.png",
          "workbench-before.png",
          "workbench-after.png",
          "label.png",
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
