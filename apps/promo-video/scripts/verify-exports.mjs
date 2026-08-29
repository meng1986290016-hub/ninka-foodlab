import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const captureDir = path.join(packageRoot, "public/captures");
const reviewDir = path.join(packageRoot, "out/review");
const landscapeReviewDir = path.join(packageRoot, "out/review-landscape");

function pngSize(buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("不是 PNG 文件");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function findAtoms(buffer, type) {
  const matches = [];
  let offset = 0;
  while (offset < buffer.length) {
    const index = buffer.indexOf(type, offset, "ascii");
    if (index < 0) break;
    if (index >= 4) {
      const size = buffer.readUInt32BE(index - 4);
      if (size >= 8 && index - 4 + size <= buffer.length) {
        matches.push({ typeOffset: index, atomStart: index - 4, size });
      }
    }
    offset = index + 4;
  }
  return matches;
}

function inspectMp4(buffer) {
  const tracks = findAtoms(buffer, "trak").map((atom) =>
    buffer.subarray(atom.atomStart, atom.atomStart + atom.size),
  );
  const trackType = (track) => {
    const hdlr = findAtoms(track, "hdlr")[0];
    return hdlr
      ? track.toString("ascii", hdlr.typeOffset + 12, hdlr.typeOffset + 16)
      : null;
  };
  const videoTrack = tracks.find((track) => trackType(track) === "vide");
  if (!videoTrack) throw new Error("MP4 缺少视频轨道");

  const mdhd = findAtoms(videoTrack, "mdhd")[0];
  if (!mdhd) throw new Error("MP4 缺少视频轨道 mdhd");
  const version = videoTrack.readUInt8(mdhd.typeOffset + 4);
  const timescale = videoTrack.readUInt32BE(mdhd.typeOffset + (version === 1 ? 24 : 16));
  const duration = version === 1
    ? Number(videoTrack.readBigUInt64BE(mdhd.typeOffset + 28))
    : videoTrack.readUInt32BE(mdhd.typeOffset + 20);
  const tkhd = findAtoms(videoTrack, "tkhd")[0];
  if (!tkhd) throw new Error("MP4 视频轨道缺少 tkhd");
  const width = videoTrack.readUInt32BE(tkhd.atomStart + tkhd.size - 8) / 65536;
  const height = videoTrack.readUInt32BE(tkhd.atomStart + tkhd.size - 4) / 65536;
  const sampleCounts = findAtoms(videoTrack, "stts").map((atom) => {
    const entryCount = videoTrack.readUInt32BE(atom.typeOffset + 8);
    let cursor = atom.typeOffset + 12;
    let samples = 0;
    for (let index = 0; index < entryCount; index += 1) {
      samples += videoTrack.readUInt32BE(cursor);
      cursor += 8;
    }
    return samples;
  });
  return {
    durationSeconds: duration / timescale,
    width: Math.round(width),
    height: Math.round(height),
    samples: Math.max(...sampleCounts, 0),
    codec: videoTrack.includes(Buffer.from("avc1")) ? "h264" : "unknown",
    hasAudio: tracks.some((track) => trackType(track) === "soun"),
  };
}

async function assertFile(filePath, minimumBytes = 1000) {
  await access(filePath);
  const info = await stat(filePath);
  if (info.size < minimumBytes) throw new Error(`${filePath} 文件过小：${info.size}`);
}

const captures = [
  "ingredients.png",
  "ingredients-nutrition.png",
  "agent-input.png",
  "agent-progress.png",
  "agent-result.png",
  "workbench-before.png",
  "workbench-after.png",
  "label.png",
];
for (const file of captures) {
  const filePath = path.join(captureDir, file);
  await assertFile(filePath);
  const dimensions = pngSize(await readFile(filePath));
  if (dimensions.width !== 1440 || dimensions.height !== 900) {
    throw new Error(`${file} 尺寸错误：${dimensions.width}x${dimensions.height}`);
  }
}

const manifest = JSON.parse(await readFile(path.join(captureDir, "manifest.json"), "utf8"));
if (!String(manifest.source).includes("latest workspace source")) {
  throw new Error("截图来源清单未声明最新版工作区源码");
}
if (!String(manifest.privacy).includes("no SQLite")) {
  throw new Error("截图来源清单未声明隔离数据边界");
}

const keyframes = (await readdir(reviewDir)).filter((file) => file.startsWith("keyframe-") && file.endsWith(".png"));
if (keyframes.length !== 6) throw new Error(`关键帧数量应为 6，实际为 ${keyframes.length}`);
for (const file of keyframes) {
  const dimensions = pngSize(await readFile(path.join(reviewDir, file)));
  if (dimensions.width !== 1080 || dimensions.height !== 1920) {
    throw new Error(`${file} 尺寸错误：${dimensions.width}x${dimensions.height}`);
  }
}

const landscapeKeyframes = (await readdir(landscapeReviewDir)).filter(
  (file) => file.startsWith("landscape-keyframe-") && file.endsWith(".png"),
);
if (landscapeKeyframes.length !== 6) {
  throw new Error(`横版关键帧数量应为 6，实际为 ${landscapeKeyframes.length}`);
}
for (const file of landscapeKeyframes) {
  const dimensions = pngSize(await readFile(path.join(landscapeReviewDir, file)));
  if (dimensions.width !== 2560 || dimensions.height !== 1440) {
    throw new Error(`${file} 尺寸错误：${dimensions.width}x${dimensions.height}`);
  }
}

const coverPath = path.join(reviewDir, "ninka-foodlab-xhs-cover-3x4.png");
await assertFile(coverPath);
const coverSize = pngSize(await readFile(coverPath));
if (coverSize.width !== 1242 || coverSize.height !== 1660) {
  throw new Error(`封面尺寸错误：${coverSize.width}x${coverSize.height}`);
}

const previewPath = path.join(packageRoot, "out/ninka-foodlab-promo-silent-preview.mp4");
await assertFile(previewPath, 100000);
const preview = inspectMp4(await readFile(previewPath));
if (preview.width !== 540 || preview.height !== 960) throw new Error(`预览尺寸错误：${preview.width}x${preview.height}`);
if (Math.abs(preview.durationSeconds - 45) > 0.05) throw new Error(`预览时长错误：${preview.durationSeconds}`);
if (preview.samples !== 1350) throw new Error(`预览帧数错误：${preview.samples}`);
if (preview.codec !== "h264") throw new Error(`预览编码错误：${preview.codec}`);
if (preview.hasAudio) throw new Error("无音乐预览不应包含音轨");

const fullHdPath = path.join(packageRoot, "out/ninka-foodlab-promo-silent-1080x1920.mp4");
await assertFile(fullHdPath, 100000);
const fullHd = inspectMp4(await readFile(fullHdPath));
if (fullHd.width !== 1080 || fullHd.height !== 1920) {
  throw new Error(`全高清版本尺寸错误：${fullHd.width}x${fullHd.height}`);
}
if (Math.abs(fullHd.durationSeconds - 45) > 0.05) {
  throw new Error(`全高清版本时长错误：${fullHd.durationSeconds}`);
}
if (fullHd.samples !== 1350) throw new Error(`全高清版本帧数错误：${fullHd.samples}`);
if (fullHd.codec !== "h264") throw new Error(`全高清版本编码错误：${fullHd.codec}`);
if (fullHd.hasAudio) throw new Error("全高清静音版本不应包含音轨");

const twoKPath = path.join(packageRoot, "out/ninka-foodlab-promo-silent-1440x2560.mp4");
await assertFile(twoKPath, 100000);
const twoK = inspectMp4(await readFile(twoKPath));
if (twoK.width !== 1440 || twoK.height !== 2560) {
  throw new Error(`2K 版本尺寸错误：${twoK.width}x${twoK.height}`);
}
if (Math.abs(twoK.durationSeconds - 45) > 0.05) {
  throw new Error(`2K 版本时长错误：${twoK.durationSeconds}`);
}
if (twoK.samples !== 1350) throw new Error(`2K 版本帧数错误：${twoK.samples}`);
if (twoK.codec !== "h264") throw new Error(`2K 版本编码错误：${twoK.codec}`);
if (twoK.hasAudio) throw new Error("2K 静音版本不应包含音轨");

const landscapePath = path.join(packageRoot, "out/ninka-foodlab-promo-landscape-2560x1440.mp4");
await assertFile(landscapePath, 100000);
const landscape = inspectMp4(await readFile(landscapePath));
if (landscape.width !== 2560 || landscape.height !== 1440) {
  throw new Error(`横版尺寸错误：${landscape.width}x${landscape.height}`);
}
if (Math.abs(landscape.durationSeconds - 45) > 0.05) {
  throw new Error(`横版时长错误：${landscape.durationSeconds}`);
}
if (landscape.samples !== 1350) throw new Error(`横版帧数错误：${landscape.samples}`);
if (landscape.codec !== "h264") throw new Error(`横版编码错误：${landscape.codec}`);
if (landscape.hasAudio) throw new Error("横版静音版本不应包含音轨");

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await sourceFiles(target)));
    else files.push(target);
  }
  return files;
}

const forbidden = ["assets/video/", "launch-film", "Seedance", "二维码", "低糖已达标"];
for (const filePath of await sourceFiles(path.join(packageRoot, "src/remotion"))) {
  const content = await readFile(filePath, "utf8");
  for (const token of forbidden) {
    if (content.includes(token)) throw new Error(`${path.relative(packageRoot, filePath)} 包含禁止内容：${token}`);
  }
}

console.log(JSON.stringify({
  captures: captures.length,
  keyframes: keyframes.length,
  landscapeKeyframes: landscapeKeyframes.length,
  cover: coverSize,
  preview,
  fullHd,
  twoK,
  landscape,
}, null, 2));
