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

export function LandscapeSceneShell({
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
        name="Landscape organic technology glow"
        style={{
          position: "absolute",
          top: -980,
          left: -420,
          width: 1740,
          height: 1740,
          borderRadius: 9999,
          opacity: interpolate(frame, [0, durationInFrames - 1], [0.44, 0.68], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(
            frame,
            [0, durationInFrames - 1],
            ["0px 0px", "120px 48px"],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            },
          ),
          background:
            "radial-gradient(circle, rgba(21,61,54,0.98) 0%, rgba(21,61,54,0.16) 58%, rgba(21,61,54,0) 74%)",
        }}
      />
      <Interactive.Div
        name="Landscape grain glow"
        style={{
          position: "absolute",
          right: -520,
          bottom: -1040,
          width: 1700,
          height: 1700,
          borderRadius: 9999,
          opacity: 0.18,
          background:
            "radial-gradient(circle, rgba(239,189,80,0.88) 0%, rgba(239,189,80,0.07) 56%, rgba(239,189,80,0) 74%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.1,
          backgroundImage:
            "radial-gradient(circle at center, rgba(255,247,231,0.72) 1.2px, transparent 1.2px)",
          backgroundSize: "38px 38px",
          maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
        }}
      />
      {children}
      {functional ? (
        <Interactive.Div
          name="Landscape demo data badge"
          style={{
            position: "absolute",
            top: 74,
            right: 138,
            padding: "14px 26px",
            border: "1px solid rgba(239,189,80,0.5)",
            borderRadius: 999,
            backgroundColor: "rgba(11,20,17,0.82)",
            color: colors.grain,
            fontSize: 30,
            fontWeight: 720,
            letterSpacing: 4,
          }}
        >
          {demoBadge}
        </Interactive.Div>
      ) : null}
    </AbsoluteFill>
  );
}
