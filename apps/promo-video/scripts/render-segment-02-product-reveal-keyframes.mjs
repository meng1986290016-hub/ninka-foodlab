import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(packageRoot, "out/review-segment-02-product-reveal-v01");
const frames = [6, 20, 38, 52, 68, 84, 102, 124];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabSegment02ProductRevealV01",
    path.join(
      outputDirectory,
      `segment-02-product-reveal-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
