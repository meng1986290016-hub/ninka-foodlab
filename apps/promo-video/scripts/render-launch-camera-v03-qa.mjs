import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const reviewDirectory = path.join(packageRoot, "out/review-launch-camera-v03-qa");
await mkdir(reviewDirectory, { recursive: true });

const frames = [400, 530, 610, 790, 925];
for (const frame of frames) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabLaunchStoryboardV03Camera",
    path.join(reviewDirectory, `launch-camera-v03-frame-${frame}.png`),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
