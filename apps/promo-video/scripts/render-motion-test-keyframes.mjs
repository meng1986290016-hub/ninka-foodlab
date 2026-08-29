import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const reviewDirectory = path.join(packageRoot, "out/review-motion-test-v02");
await mkdir(reviewDirectory, { recursive: true });

const frames = [8, 24, 36, 50, 58, 64, 68, 69, 88, 122, 160, 164, 165, 190, 230, 262];
for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabBrandBridgeMotionTest",
    path.join(
      reviewDirectory,
      `motion-test-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
