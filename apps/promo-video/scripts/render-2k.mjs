import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabPromo2K",
  path.join(packageRoot, "out/ninka-foodlab-promo-silent-1440x2560.mp4"),
  "--codec=h264",
  "--crf=16",
  "--concurrency=4",
  "--muted",
  "--pixel-format=yuv420p",
  "--log=warn",
]);
