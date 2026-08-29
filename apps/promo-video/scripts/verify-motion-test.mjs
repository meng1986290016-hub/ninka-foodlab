import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const videoPath = path.join(
  packageRoot,
  "out/ninka-foodlab-brand-bridge-motion-test-v02.mp4",
);
const keyframeDirectory = path.join(packageRoot, "out/review-motion-test-v02");
const transparentBrandAssets = [
  "public/brand/ninka-symbol-color-transparent.svg",
  "public/brand/ninka-lockup-horizontal-transparent.svg",
];

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
  const tkhd = findAtoms(videoTrack, "tkhd")[0];
  if (!mdhd || !tkhd) throw new Error("MP4 视频轨道信息不完整");
  const version = videoTrack.readUInt8(mdhd.typeOffset + 4);
  const timescale = videoTrack.readUInt32BE(mdhd.typeOffset + (version === 1 ? 24 : 16));
  const duration = version === 1
    ? Number(videoTrack.readBigUInt64BE(mdhd.typeOffset + 28))
    : videoTrack.readUInt32BE(mdhd.typeOffset + 20);
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
    width: Math.round(width),
    height: Math.round(height),
    durationSeconds: duration / timescale,
    samples: Math.max(...sampleCounts, 0),
    codec: videoTrack.includes(Buffer.from("avc1")) ? "h264" : "unknown",
    hasAudio: tracks.some((track) => trackType(track) === "soun"),
  };
}

await access(videoPath);
const videoInfo = await stat(videoPath);
if (videoInfo.size < 100_000) throw new Error(`预演文件过小：${videoInfo.size}`);
const video = inspectMp4(await readFile(videoPath));
if (video.width !== 1280 || video.height !== 720) {
  throw new Error(`预演尺寸错误：${video.width}x${video.height}`);
}
if (Math.abs(video.durationSeconds - 8.9) > 0.05) {
  throw new Error(`预演时长错误：${video.durationSeconds}`);
}
if (video.samples !== 267) throw new Error(`预演帧数错误：${video.samples}`);
if (video.codec !== "h264") throw new Error(`预演编码错误：${video.codec}`);
if (video.hasAudio) throw new Error("静音运动预演不应包含音轨");

const keyframes = (await readdir(keyframeDirectory))
  .filter((file) => file.startsWith("motion-test-keyframe-") && file.endsWith(".png"))
  .sort();
if (keyframes.length !== 16) {
  throw new Error(`运动预演关键帧数量应为 16，实际为 ${keyframes.length}`);
}
for (const file of keyframes) {
  const dimensions = pngSize(await readFile(path.join(keyframeDirectory, file)));
  if (dimensions.width !== 2560 || dimensions.height !== 1440) {
    throw new Error(`${file} 尺寸错误：${dimensions.width}x${dimensions.height}`);
  }
}

for (const relativePath of transparentBrandAssets) {
  const source = await readFile(path.join(packageRoot, relativePath), "utf8");
  if (/<rect\b/i.test(source)) {
    throw new Error(`${relativePath} 仍包含可能形成底色块的 rect`);
  }
}

console.log(JSON.stringify({
  file: path.relative(packageRoot, videoPath),
  bytes: videoInfo.size,
  video,
  keyframes: keyframes.length,
  keyframeSize: { width: 2560, height: 1440 },
  transparentBrandAssets,
}, null, 2));
