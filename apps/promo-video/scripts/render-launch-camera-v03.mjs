import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabLaunchStoryboardV03Camera",
  path.join(packageRoot, "out/ninka-foodlab-launch-camera-v03-preview.mp4"),
  "--codec=h264",
  "--crf=20",
  "--scale=0.5",
  "--pixel-format=yuv420p",
  "--log=warn",
]);
