import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-segment-04-workbench-recalculation-v01",
);
const frames = [0, 6, 14, 23, 38, 54, 68, 78, 96, 116, 132, 149, 164, 184];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabSegment04WorkbenchRecalculationV01",
    path.join(
      outputDirectory,
      `segment-04-workbench-recalculation-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
