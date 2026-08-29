import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { BrandLockup } from "../components/Brand";
import { SceneShell } from "../components/SceneShell";

export function IntroScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();
  return (
    <SceneShell demoBadge={demoBadge} functional={false}>
      <Interactive.Div
        name="Brand entrance"
        style={{
          position: "absolute",
          top: 500,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 24], [0.9, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 180 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <BrandLockup width={760} />
      </Interactive.Div>
      <Interactive.Div
        name="Opening statement"
        style={{
          position: "absolute",
          top: 880,
          left: 105,
          right: 105,
          opacity: interpolate(frame, [18, 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [18, 40], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          color: colors.cream,
          fontSize: 58,
          fontWeight: 720,
          lineHeight: 1.42,
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
          bottom: 260,
          left: "50%",
          width: 180,
          height: 4,
          borderRadius: 999,
          translate: "-50% 0",
          background: `linear-gradient(90deg, ${colors.tomato}, ${colors.grain})`,
        }}
      />
    </SceneShell>
  );
}
