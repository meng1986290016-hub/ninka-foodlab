import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

import { colors } from "../theme";

export function SceneShell({
  children,
  demoBadge,
  functional = true,
}: {
  children: ReactNode;
  demoBadge: string;
  functional?: boolean;
}) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forestDeep,
        color: colors.cream,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <Interactive.Div
        name="Organic technology glow"
        style={{
          position: "absolute",
          top: -320,
          left: -220,
          width: 940,
          height: 940,
          borderRadius: 999,
          opacity: interpolate(frame, [0, durationInFrames - 1], [0.4, 0.68], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(
            frame,
            [0, durationInFrames - 1],
            ["0px 0px", "80px 36px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            },
          ),
          background:
            "radial-gradient(circle, rgba(21,61,54,0.95) 0%, rgba(21,61,54,0.15) 56%, rgba(21,61,54,0) 72%)",
        }}
      />
      <Interactive.Div
        name="Grain glow"
        style={{
          position: "absolute",
          right: -360,
          bottom: -360,
          width: 920,
          height: 920,
          borderRadius: 999,
          opacity: 0.16,
          background:
            "radial-gradient(circle, rgba(239,189,80,0.85) 0%, rgba(239,189,80,0.06) 54%, rgba(239,189,80,0) 72%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.11,
          backgroundImage:
            "radial-gradient(circle at center, rgba(255,247,231,0.7) 1px, transparent 1px)",
          backgroundSize: "30px 30px",
          maskImage: "linear-gradient(to bottom, transparent, black 18%, black 84%, transparent)",
        }}
      />
      {children}
      {functional ? (
        <Interactive.Div
          name="Demo data badge"
          style={{
            position: "absolute",
            top: 100,
            right: 80,
            padding: "11px 20px",
            border: "1px solid rgba(239,189,80,0.45)",
            borderRadius: 999,
            backgroundColor: "rgba(11,20,17,0.78)",
            color: colors.grain,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: 3,
          }}
        >
          {demoBadge}
        </Interactive.Div>
      ) : null}
    </AbsoluteFill>
  );
}
