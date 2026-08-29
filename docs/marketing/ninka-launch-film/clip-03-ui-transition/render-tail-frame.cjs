const fs = require("node:fs");
const path = require("node:path");
const sharp = require("/Users/andrew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp");

const projectRoot = path.resolve(__dirname, "../../../..");
const screenshotPath = path.join(projectRoot, "assets/video/launch-film/source-ui/ingredient-library-current-2026-08-23-v03.png");
const frameDir = path.join(projectRoot, "assets/video/launch-film/frames");
const plateDir = path.join(projectRoot, "assets/video/launch-film/plates");
const sourceUiDir = path.join(projectRoot, "assets/video/launch-film/source-ui");
const cleanSourcePath = path.join(sourceUiDir, "ingredient-library-current-dark-v01.png");
const tailPath = path.join(frameDir, "clip-03-ui-transition-tail-xhs-v02.png");
const platePath = path.join(plateDir, "xhs-ui-stage-forest-v01.png");

const canvasWidth = 1080;
const canvasHeight = 1920;
const windowX = 50;
const windowY = 664;
const windowWidth = 980;
const windowHeight = 592;
const radius = 22;

fs.mkdirSync(frameDir, { recursive: true });
fs.mkdirSync(plateDir, { recursive: true });
fs.mkdirSync(sourceUiDir, { recursive: true });

const backgroundSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#153D36"/>
      <stop offset="0.52" stop-color="#0B2823"/>
      <stop offset="1" stop-color="#04120F"/>
    </linearGradient>
    <radialGradient id="warm" cx="50%" cy="49%" r="42%">
      <stop offset="0" stop-color="#EFBD50" stop-opacity="0.18"/>
      <stop offset="0.38" stop-color="#EFBD50" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#EFBD50" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="forest" cx="18%" cy="13%" r="58%">
      <stop offset="0" stop-color="#2D665B" stop-opacity="0.28"/>
      <stop offset="1" stop-color="#153D36" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feGaussianBlur stdDeviation="30"/>
    </filter>
    <pattern id="grain" width="86" height="86" patternUnits="userSpaceOnUse">
      <circle cx="11" cy="19" r="1.1" fill="#FFF7E7" opacity="0.05"/>
      <circle cx="63" cy="37" r="0.8" fill="#EFBD50" opacity="0.06"/>
      <circle cx="37" cy="72" r="0.7" fill="#FFF7E7" opacity="0.04"/>
    </pattern>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <rect width="1080" height="1920" fill="url(#forest)"/>
  <rect width="1080" height="1920" fill="url(#warm)"/>
  <rect width="1080" height="1920" fill="url(#grain)"/>
  <ellipse cx="540" cy="959" rx="430" ry="285" fill="#000000" opacity="0.52" filter="url(#shadow)"/>
  <path d="M120 960 C285 760 795 760 960 960" fill="none" stroke="#EFBD50" stroke-opacity="0.08" stroke-width="1"/>
  <path d="M120 960 C285 1160 795 1160 960 960" fill="none" stroke="#FFF7E7" stroke-opacity="0.05" stroke-width="1"/>
</svg>`);

const maskSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${windowWidth}" height="${windowHeight}">
  <rect width="${windowWidth}" height="${windowHeight}" rx="${radius}" ry="${radius}" fill="#ffffff"/>
</svg>`);

const borderSvg = Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${canvasWidth}" height="${canvasHeight}">
  <rect x="${windowX}" y="${windowY}" width="${windowWidth}" height="${windowHeight}" rx="${radius}" ry="${radius}"
        fill="none" stroke="#FFF7E7" stroke-opacity="0.22" stroke-width="2"/>
  <path d="M${windowX + 24} ${windowY + 1} H${windowX + windowWidth - 24}"
        stroke="#EFBD50" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>
</svg>`);

async function main() {
  const plate = await sharp(backgroundSvg).png().toBuffer();
  await sharp(plate).png().toFile(platePath);

  const cleanUi = await sharp(screenshotPath)
    .extract({ left: 0, top: 27, width: 1228, height: 741 })
    .png()
    .toBuffer();
  await sharp(cleanUi).png().toFile(cleanSourcePath);

  const roundedScreenshot = await sharp(cleanUi)
    .resize(windowWidth, windowHeight, { fit: "fill" })
    .ensureAlpha()
    .composite([{ input: maskSvg, blend: "dest-in" }])
    .png()
    .toBuffer();

  await sharp(plate)
    .composite([
      { input: roundedScreenshot, left: windowX, top: windowY },
      { input: borderSvg, left: 0, top: 0 },
    ])
    .png()
    .toFile(tailPath);

  console.log(JSON.stringify({ cleanSourcePath, tailPath, platePath, windowX, windowY, windowWidth, windowHeight }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
