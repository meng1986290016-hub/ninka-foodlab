import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabCombinedFirstThreeV01",
  path.join(packageRoot, "out/ninka-foodlab-combined-first-three-v01.mp4"),
  "--codec=h264",
  "--crf=19",
  "--scale=0.5",
  "--pixel-format=yuv420p",
  "--audio-codec=aac",
  "--log=warn",
]);
