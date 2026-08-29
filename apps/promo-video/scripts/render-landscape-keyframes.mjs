import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const reviewDirectory = path.join(packageRoot, "out/review-landscape");
await mkdir(reviewDirectory, { recursive: true });

const frames = [38, 180, 765, 1070, 1215, 1312];
for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabPromoLandscape",
    path.join(reviewDirectory, `landscape-keyframe-${String(index + 1).padStart(2, "0")}.png`),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
