import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabSegment04WorkbenchRecalculationV02",
  path.join(
    packageRoot,
    "out/ninka-foodlab-segment-04-workbench-recalculation-v02.mp4",
  ),
  "--codec=h264",
  "--crf=19",
  "--scale=0.5",
  "--pixel-format=yuv420p",
  "--audio-codec=aac",
  "--log=warn",
]);
