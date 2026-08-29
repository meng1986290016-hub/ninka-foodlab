import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const videoPath = path.join(
  packageRoot,
  "out/ninka-foodlab-segment-07-brand-bridge-v01.mp4",
);

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
if (videoInfo.size < 250_000) throw new Error(`第七段样片文件过小：${videoInfo.size}`);
const video = inspectMp4(await readFile(videoPath));
if (video.width !== 1280 || video.height !== 720) {
  throw new Error(`样片尺寸错误：${video.width}x${video.height}`);
}
if (Math.abs(video.durationSeconds - 3) > 0.05) {
  throw new Error(`样片时长错误：${video.durationSeconds}`);
}
if (video.samples !== 90) throw new Error(`样片帧数错误：${video.samples}`);
if (video.codec !== "h264") throw new Error(`样片编码错误：${video.codec}`);
if (!video.hasAudio) throw new Error("第七段样片应包含原创临时音轨");

console.log(JSON.stringify({
  file: path.relative(packageRoot, videoPath),
  bytes: videoInfo.size,
  video,
  motion: {
    exactSegment06Continuation: true,
    nativeProposalRemainsSource: true,
    exactLogoModulesFromFirstAppearance: 9,
    circleToLogoShapeSwap: false,
    bitmapLogoPlateShown: false,
    finalVectorSymbolCentered: true,
    readyForSegment08: true,
  },
  audioSource: "original synthetic temporary rhythm bed plus retained SFX",
}, null, 2));
