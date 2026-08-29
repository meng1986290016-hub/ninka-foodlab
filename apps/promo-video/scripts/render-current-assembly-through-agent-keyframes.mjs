import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-current-assembly-through-agent-v01",
);
const frames = [0, 104, 224, 237, 260, 350, 351, 389, 403, 415, 578, 579, 627, 634, 643, 653, 705, 830];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabCurrentAssemblyThroughAgentV01",
    path.join(
      outputDirectory,
      `current-assembly-through-agent-v01-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
