import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabBrandBridgeMotionTest",
  path.join(packageRoot, "out/ninka-foodlab-brand-bridge-motion-test-v02.mp4"),
  "--codec=h264",
  "--crf=20",
  "--scale=0.5",
  "--muted",
  "--pixel-format=yuv420p",
  "--log=warn",
]);
