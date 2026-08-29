import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-full-assembly-v01",
);
const frames = [
  0,
  104,
  224,
  350,
  351,
  578,
  579,
  830,
  831,
  1043,
  1044,
  1133,
  1134,
  1229,
  1230,
  1337,
];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabFullAssemblyV01",
    path.join(
      outputDirectory,
      `full-assembly-v01-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
