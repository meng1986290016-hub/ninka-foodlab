import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const reviewDirectory = path.join(packageRoot, "out/review-launch-camera-v03");
await mkdir(reviewDirectory, { recursive: true });

const frames = [
  15, 55, 100, 170, 190, 220, 236, 280, 315, 335, 360, 370, 400,
  445, 485, 515, 530, 550, 575, 610, 650, 705, 745, 765, 790, 835,
  880, 925, 965, 1050, 1160, 1200,
];

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabLaunchStoryboardV03Camera",
    path.join(
      reviewDirectory,
      `launch-camera-v03-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
