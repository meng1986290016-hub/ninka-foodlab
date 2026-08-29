import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-segment-04-workbench-recalculation-v02",
);
const frames = [0, 12, 21, 30, 38, 52, 64, 93, 159, 216];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabSegment04WorkbenchRecalculationV02",
    path.join(
      outputDirectory,
      `segment-04-workbench-recalculation-v02-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
