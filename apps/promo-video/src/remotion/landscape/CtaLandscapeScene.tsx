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

export function CtaLandscapeScene({ cta, demoBadge, repositoryPath }: PromoProps) {
  const frame = useCurrentFrame();

  return (
    <LandscapeSceneShell demoBadge={demoBadge} functional={false}>
      <Interactive.Div
        name="Landscape closing brand"
        style={{
          position: "absolute",
          top: 190,
          left: 160,
          right: 160,
          display: "flex",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 18], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          scale: interpolate(frame, [0, 22], [0.94, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.spring({ damping: 180 }),
            output: "perceptual-scale",
          }),
        }}
      >
        <BrandLockup width={1000} />
      </Interactive.Div>
      <Interactive.Div
        name="Landscape product positioning"
        style={{
          position: "absolute",
          top: 580,
          left: 160,
          right: 160,
          color: colors.inkSoft,
          fontSize: 48,
          fontWeight: 620,
          letterSpacing: 7,
          textAlign: "center",
        }}
      >
        开源 · 离线优先 · 面向食品研发
      </Interactive.Div>
      <Interactive.Div
        name="Landscape GitHub CTA"
        style={{
          position: "absolute",
          top: 760,
          left: 160,
          right: 160,
          color: colors.cream,
          fontSize: 104,
          fontWeight: 790,
          textAlign: "center",
        }}
      >
        {cta}
      </Interactive.Div>
      <Interactive.Div
        name="Landscape repository path"
        style={{
          position: "absolute",
          top: 930,
          left: "50%",
          width: 1480,
          padding: "30px 36px",
          border: "1px solid rgba(239,189,80,0.46)",
          borderRadius: 22,
          translate: "-50% 0",
          backgroundColor: "rgba(239,189,80,0.08)",
          color: colors.grain,
          fontFamily: '"Manrope Promo", sans-serif',
          fontSize: 38,
          fontWeight: 660,
          textAlign: "center",
        }}
      >
        {repositoryPath}
      </Interactive.Div>
    </LandscapeSceneShell>
  );
}
