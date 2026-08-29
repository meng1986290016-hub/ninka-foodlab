import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabLaunchStoryboardV02",
  path.join(packageRoot, "out/ninka-foodlab-launch-animatic-v01.mp4"),
  "--codec=h264",
  "--crf=20",
  "--scale=0.5",
  "--muted",
  "--pixel-format=yuv420p",
  "--log=warn",
]);
