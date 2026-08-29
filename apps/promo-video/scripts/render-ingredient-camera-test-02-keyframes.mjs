import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDirectory = path.join(
  packageRoot,
  "out/review-ingredient-camera-test-02",
);
const frames = [10, 26, 42, 56, 66, 82, 101, 124, 144];

await mkdir(outputDirectory, { recursive: true });

for (const [index, frame] of frames.entries()) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabIngredientCameraTest02",
    path.join(
      outputDirectory,
      `ingredient-camera-test-02-keyframe-${String(index + 1).padStart(2, "0")}.png`,
    ),
    `--frame=${frame}`,
    "--log=warn",
  ]);
}
