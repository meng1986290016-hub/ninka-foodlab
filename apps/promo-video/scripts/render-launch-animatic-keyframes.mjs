import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const reviewDirectory = path.join(packageRoot, "out/review-launch-animatic-v01");
await mkdir(reviewDirectory, { recursive: true });

const frames = [
  15, 55, 89, 100, 132, 170, 220, 290, 335, 380, 445, 520,
  585, 685, 755, 825, 915, 965, 990, 1050, 1110, 1160, 1200,
];

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabLaunchStoryboardV02",
    path.join(
      reviewDirectory,
      `launch-animatic-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
