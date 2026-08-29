import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";

export function SceneTitle({
  eyebrow,
  title,
  maxWidth = 900,
}: {
  eyebrow: string;
  title: string;
  maxWidth?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <div style={{ position: "absolute", top: 150, left: 80, maxWidth }}>
      <Interactive.Div
        name="Scene eyebrow"
        style={{
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          color: colors.grain,
          fontFamily: '"Manrope Promo", sans-serif',
          fontSize: 24,
          fontWeight: 750,
          letterSpacing: 5,
          textTransform: "uppercase",
        }}
      >
        {eyebrow}
      </Interactive.Div>
      <Interactive.Div
        name="Scene title"
        style={{
          marginTop: 18,
          opacity: interpolate(frame, [5, 24], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [5, 24], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          color: colors.cream,
          fontSize: 64,
          fontWeight: 760,
          lineHeight: 1.2,
          letterSpacing: -2,
        }}
      >
        {title}
      </Interactive.Div>
    </div>
  );
}

export function BottomCaption({ children }: { children: string }) {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Bottom caption"
      style={{
        position: "absolute",
        left: 80,
        right: 80,
        bottom: 170,
        opacity: interpolate(frame, [20, 38], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        color: colors.cream,
        fontSize: 50,
        fontWeight: 700,
        lineHeight: 1.35,
        textAlign: "center",
      }}
    >
      {children}
    </Interactive.Div>
  );
}
