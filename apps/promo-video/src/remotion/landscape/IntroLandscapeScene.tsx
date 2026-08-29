import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import type { PromoProps } from "../schema";
import { BrandLockup } from "../components/Brand";
import { colors } from "../theme";
import { LandscapeSceneShell } from "./LandscapeSceneShell";

export function IntroLandscapeScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();

  return (
    <LandscapeSceneShell demoBadge={demoBadge} functional={false}>
      <Interactive.Div
        name="Landscape brand entrance"
        style={{
          position: "absolute",
          top: 250,
          left: 180,
          right: 180,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 24], [0.92, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 180 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <BrandLockup width={1040} />
      </Interactive.Div>
      <Interactive.Div
        name="Landscape opening statement"
        style={{
          position: "absolute",
          top: 680,
          left: 240,
          right: 240,
          opacity: interpolate(frame, [18, 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [18, 40], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          color: colors.cream,
          fontSize: 96,
          fontWeight: 740,
          lineHeight: 1.34,
          textAlign: "center",
        }}
      >
        原料、配方与 AI 协作
        <br />
        都在一个本地工作台里
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          bottom: 148,
          left: "50%",
          width: 260,
          height: 6,
          borderRadius: 999,
          translate: "-50% 0",
          background: `linear-gradient(90deg, ${colors.tomato}, ${colors.grain})`,
        }}
      />
    </LandscapeSceneShell>
  );
}
