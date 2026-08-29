import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const outputDir = path.join(packageRoot, "out/review");
await mkdir(outputDir, { recursive: true });
await runRemotion([
  "still",
  entryPoint,
  "NinkaFoodLabCover",
  path.join(outputDir, "ninka-foodlab-xhs-cover-3x4.png"),
  "--image-format=png",
  "--log=warn",
]);
