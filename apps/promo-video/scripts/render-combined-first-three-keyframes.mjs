import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(packageRoot, "out/review-combined-first-three-v01");
const frames = [98, 110, 145, 200, 224, 231, 237, 260, 310, 345];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabCombinedFirstThreeV01",
    path.join(
      outputDirectory,
      `combined-first-three-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
