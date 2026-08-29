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

export function CtaScene({ cta, demoBadge, repositoryPath }: PromoProps) {
  const frame = useCurrentFrame();
  return (
    <SceneShell demoBadge={demoBadge} functional={false}>
      <Interactive.Div
        name="Closing brand"
        style={{
          position: "absolute",
          top: 450,
          left: 80,
          right: 80,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 22], [0.92, 1], {
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
        name="Product positioning"
        style={{
          position: "absolute",
          top: 800,
          left: 80,
          right: 80,
          color: colors.inkSoft,
          fontSize: 36,
          fontWeight: 600,
          letterSpacing: 4,
          textAlign: "center",
        }}
      >
        开源 · 离线优先 · 面向食品研发
      </Interactive.Div>
      <Interactive.Div
        name="GitHub CTA"
        style={{
          position: "absolute",
          top: 1010,
          left: 80,
          right: 80,
          color: colors.cream,
          fontSize: 64,
          fontWeight: 780,
          textAlign: "center",
        }}
      >
        {cta}
      </Interactive.Div>
      <Interactive.Div
        name="Repository path"
        style={{
          position: "absolute",
          top: 1145,
          left: 86,
          right: 86,
          padding: "24px 28px",
          border: "1px solid rgba(239,189,80,0.42)",
          borderRadius: 18,
          backgroundColor: "rgba(239,189,80,0.08)",
          color: colors.grain,
          fontFamily: '"Manrope Promo", sans-serif',
          fontSize: 26,
          fontWeight: 650,
          textAlign: "center",
        }}
      >
        {repositoryPath}
      </Interactive.Div>
    </SceneShell>
  );
}
