import { mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const isTwoK = process.argv.includes("--2k");

await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabFullAssemblyV01",
  path.join(
    packageRoot,
    isTwoK
      ? "out/ninka-foodlab-full-assembly-2560x1440-music-v01.mp4"
      : "out/ninka-foodlab-full-assembly-music-v01.mp4",
  ),
  "--codec=h264",
  `--crf=${isTwoK ? 16 : 18}`,
  ...(isTwoK ? [] : ["--scale=0.5"]),
  "--pixel-format=yuv420p",
  "--audio-codec=aac",
  "--concurrency=1",
  "--timeout=120000",
  "--log=warn",
]);
