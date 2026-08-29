import { access, mkdir } from "node:fs/promises";
import path from "node:path";

import { entryPoint, packageRoot, runRemotion } from "./remotion-cli.mjs";

const musicFile = process.env.PROMO_MUSIC_FILE?.trim();
if (!musicFile) {
  throw new Error("请设置 PROMO_MUSIC_FILE，例如 audio/ninka-foodlab-organic-tech.wav");
}
await access(path.join(packageRoot, "public", musicFile));
await mkdir(path.join(packageRoot, "out"), { recursive: true });
await runRemotion([
  "render",
  entryPoint,
  "NinkaFoodLabPromo",
  path.join(packageRoot, "out/ninka-foodlab-promo-final.mp4"),
  "--codec=h264",
  "--crf=18",
  "--pixel-format=yuv420p",
  `--props=${JSON.stringify({
    cta: "GitHub 搜索 Ninka FoodLab",
    repositoryPath: "github.com/meng1986290016-hub/ninka-foodlab",
    demoBadge: "演示数据",
    musicFile,
    musicVolume: 0.72,
  })}`,
  "--log=warn",
]);
