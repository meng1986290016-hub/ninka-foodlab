import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDir = path.join(packageRoot, "out/review");
await mkdir(outputDir, { recursive: true });

const frames = [
  [38, "keyframe-01-intro.png"],
  [180, "keyframe-02-ingredients.png"],
  [765, "keyframe-03-agent.png"],
  [1070, "keyframe-04-workbench.png"],
  [1215, "keyframe-05-label.png"],
  [1312, "keyframe-06-cta.png"],
];

for (const [frame, fileName] of frames) {
  await runRemotion([
    "still",
    entryPoint,
    "NinkaFoodLabPromo",
    path.join(outputDir, fileName),
    `--frame=${frame}`,
    "--image-format=png",
    "--log=warn",
  ]);
}
