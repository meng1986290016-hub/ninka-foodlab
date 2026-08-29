import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-segment-05-agent-capabilities-v01",
);
const frames = [0, 30, 48, 55, 64, 74, 106, 126, 154, 202, 245];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabSegment05AgentCapabilitiesV01",
    path.join(
      outputDirectory,
      `segment-05-agent-capabilities-v01-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
