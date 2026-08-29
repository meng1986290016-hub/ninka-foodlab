import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";
import type { ReactNode } from "react";

import { colors } from "../theme";

export function LandscapeSceneTitle({
  eyebrow,
  title,
}: {
  eyebrow: string;
  title: ReactNode;
}) {
  const frame = useCurrentFrame();

  return (
    <div style={{ position: "absolute", top: 178, left: 140, width: 700 }}>
      <Interactive.Div
        name="Landscape scene eyebrow"
        style={{
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          color: colors.grain,
          fontFamily: '"Manrope Promo", sans-serif',
          fontSize: 30,
          fontWeight: 760,
          letterSpacing: 6,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </Interactive.Div>
      <Interactive.Div
        name="Landscape scene title"
        style={{
          marginTop: 26,
          opacity: interpolate(frame, [5, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [5, 24], ["0px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          color: colors.cream,
          fontSize: 82,
          fontWeight: 770,
          lineHeight: 1.16,
          letterSpacing: -3,
        }}
      >
        {title}
      </Interactive.Div>
    </div>
  );
}

export function LandscapeCaption({ children }: { children: string }) {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name="Landscape caption"
      style={{
        position: "absolute",
        left: 140,
        bottom: 146,
        width: 630,
        opacity: interpolate(frame, [20, 38], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        color: colors.cream,
        fontSize: 42,
        fontWeight: 700,
        lineHeight: 1.35,
      }}
    >
      {children}
    </Interactive.Div>
  );
}
