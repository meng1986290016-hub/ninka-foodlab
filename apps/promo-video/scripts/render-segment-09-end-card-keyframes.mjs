import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-segment-09-end-card-v01",
);
const frames = [0, 8, 22, 36, 48, 60, 72, 90, 107];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabSegment09EndCardV01",
    path.join(
      outputDirectory,
      `segment-09-end-card-v01-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
