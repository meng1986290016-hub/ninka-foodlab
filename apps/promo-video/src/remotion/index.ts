import { loadFont } from "@remotion/fonts";
import { registerRoot, staticFile } from "remotion";

import "./styles.css";
import { RemotionRoot } from "./Root";

void loadFont({
  family: "Manrope Promo",
  url: staticFile("brand/Manrope-VariableFont_wght.ttf"),
  format: "truetype",
  weight: "400",
  display: "block",
});

registerRoot(RemotionRoot);
