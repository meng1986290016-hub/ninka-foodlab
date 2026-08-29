import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { packageRoot } from "./remotion-cli.mjs";

const sampleRate = 48_000;
const audioDirectory = path.join(packageRoot, "public/audio/style-test");

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

function fadeEnvelope(t, duration, fadeIn = 0.02, fadeOut = 0.12) {
  const attack = Math.min(1, t / fadeIn);
  const release = Math.min(1, (duration - t) / fadeOut);
  return Math.max(0, Math.min(attack, release));
}

function wavBuffer(duration, generator) {
  const sampleCount = Math.round(duration * sampleRate);
  const channelCount = 2;
  const bytesPerSample = 2;
  const dataSize = sampleCount * channelCount * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channelCount, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channelCount * bytesPerSample, 28);
  buffer.writeUInt16LE(channelCount * bytesPerSample, 32);
  buffer.writeUInt16LE(bytesPerSample * 8, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate;
    const [left, right] = generator(time, index, duration);
    const offset = 44 + index * 4;
    buffer.writeInt16LE(Math.round(clamp(left) * 32767), offset);
    buffer.writeInt16LE(Math.round(clamp(right) * 32767), offset + 2);
  }
  return buffer;
}

let noiseState = 0x31f0a91d;
function deterministicNoise() {
  noiseState ^= noiseState << 13;
  noiseState ^= noiseState >>> 17;
  noiseState ^= noiseState << 5;
  return ((noiseState >>> 0) / 0xffffffff) * 2 - 1;
}

async function writeWav(name, duration, generator) {
  noiseState = 0x31f0a91d;
  await writeFile(path.join(audioDirectory, name), wavBuffer(duration, generator));
}

await mkdir(audioDirectory, { recursive: true });

await writeWav("rhythm-bed.wav", 12.5, (t, _index, duration) => {
  const master = fadeEnvelope(t, duration, 0.35, 0.8);
  const tremolo = 0.74 + 0.26 * Math.sin(2 * Math.PI * 2 * t - Math.PI / 2);
  const pad =
    Math.sin(2 * Math.PI * 110 * t) * 0.045 +
    Math.sin(2 * Math.PI * 164.81 * t) * 0.026 +
    Math.sin(2 * Math.PI * 220 * t) * 0.018;
  const beatPhase = t % 0.5;
  const kick =
    Math.sin(2 * Math.PI * (54 + 34 * Math.exp(-beatPhase * 18)) * t) *
    Math.exp(-beatPhase * 15) *
    0.13;
  const offbeatPhase = (t + 0.25) % 0.5;
  const softPulse =
    Math.sin(2 * Math.PI * 330 * t) * Math.exp(-offbeatPhase * 22) * 0.017;
  const motion = 0.92 + 0.08 * Math.sin(2 * Math.PI * 0.08 * t);
  const left = (pad * tremolo + kick + softPulse) * master * motion;
  const right =
    (pad * (0.92 + 0.08 * Math.sin(2 * Math.PI * 0.11 * t)) +
      kick * 0.94 +
      softPulse * 1.08) *
    master;
  return [left, right];
});

await writeWav("type-tick.wav", 0.09, (t, _index, duration) => {
  const envelope = Math.exp(-t * 58) * fadeEnvelope(t, duration, 0.002, 0.018);
  const noise = deterministicNoise() * 0.16;
  const tone = Math.sin(2 * Math.PI * 2360 * t) * 0.12;
  return [(noise + tone) * envelope, (noise * 0.86 + tone) * envelope];
});

await writeWav("editorial-snap.wav", 0.22, (t, _index, duration) => {
  const envelope = Math.exp(-t * 24) * fadeEnvelope(t, duration, 0.002, 0.04);
  const tone =
    Math.sin(2 * Math.PI * (410 + 1180 * t) * t) * 0.17 +
    deterministicNoise() * 0.08;
  return [tone * envelope, tone * envelope * 0.92];
});

let whooshLeft = 0;
let whooshRight = 0;
await writeWav("soft-whoosh.wav", 0.72, (t, _index, duration) => {
  const progress = t / duration;
  const envelope = Math.sin(Math.PI * progress) ** 1.4;
  const coefficient = 0.025 + progress * 0.18;
  whooshLeft += coefficient * (deterministicNoise() - whooshLeft);
  whooshRight += coefficient * (deterministicNoise() - whooshRight);
  const sweep = Math.sin(2 * Math.PI * (120 + 760 * progress ** 2) * t) * 0.035;
  return [
    (whooshLeft * 0.34 + sweep) * envelope,
    (whooshRight * 0.34 + sweep * 0.9) * envelope,
  ];
});

await writeWav("brand-hit.wav", 1.28, (t, _index, duration) => {
  const envelope = fadeEnvelope(t, duration, 0.014, 0.62) * Math.exp(-t * 1.8);
  const chord =
    Math.sin(2 * Math.PI * 196 * t) * 0.11 +
    Math.sin(2 * Math.PI * 246.94 * t) * 0.08 +
    Math.sin(2 * Math.PI * 293.66 * t) * 0.07 +
    Math.sin(2 * Math.PI * 392 * t) * 0.035;
  const bass = Math.sin(2 * Math.PI * 98 * t) * 0.075 * Math.exp(-t * 3.2);
  return [(chord + bass) * envelope, (chord * 0.96 + bass) * envelope];
});

await writeWav("ui-click.wav", 0.12, (t, _index, duration) => {
  const envelope = Math.exp(-t * 42) * fadeEnvelope(t, duration, 0.001, 0.025);
  const click =
    Math.sin(2 * Math.PI * 1480 * t) * 0.16 + deterministicNoise() * 0.055;
  return [click * envelope, click * envelope];
});

console.log(`Generated original style-test audio in ${audioDirectory}`);
