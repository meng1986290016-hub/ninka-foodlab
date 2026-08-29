import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-segment-06-agent-proposal-v01",
);
const frames = [0, 16, 52, 72, 92, 118, 142, 180, 209];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabSegment06AgentProposalV01",
    path.join(
      outputDirectory,
      `segment-06-agent-proposal-v01-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
