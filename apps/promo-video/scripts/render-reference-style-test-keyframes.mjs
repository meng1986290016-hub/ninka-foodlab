import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const reviewDirectory = path.join(
  packageRoot,
  "out/review-reference-language-style-test-01",
);
await mkdir(reviewDirectory, { recursive: true });

const frames = [
  12, 36, 68, 78, 100, 116, 144, 165, 174, 195, 216, 238, 258, 285, 330,
  365,
];

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabReferenceLanguageStyleTest01",
    path.join(
      reviewDirectory,
      `reference-style-test-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
