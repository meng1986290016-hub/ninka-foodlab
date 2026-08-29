import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";

export function StyleTestStage({
  children,
  background = colors.cream,
}: {
  children: ReactNode;
  background?: string;
}) {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: background,
        color: colors.forestDeep,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      {children}
    </AbsoluteFill>
  );
}

export function PaperGrain({ dark = false }: { dark?: boolean }) {
  return (
    <AbsoluteFill
      style={{
        opacity: dark ? 0.16 : 0.22,
        backgroundImage: `radial-gradient(circle at 15% 22%, ${
          dark ? "rgba(239,189,80,0.20)" : "rgba(21,61,54,0.14)"
        } 0 1px, transparent 1.5px), radial-gradient(circle at 82% 74%, ${
          dark ? "rgba(255,247,231,0.16)" : "rgba(223,107,69,0.12)"
        } 0 1px, transparent 1.4px)`,
        backgroundSize: "83px 83px, 127px 127px",
      }}
    />
  );
}

export function ReviewLabel({ text }: { text: string }) {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Style test review label"
      style={{
        position: "absolute",
        right: 68,
        bottom: 52,
        zIndex: 500,
        padding: "14px 22px",
        borderRadius: 999,
        border: "1px solid rgba(255,247,231,0.22)",
        backgroundColor: "rgba(11,20,17,0.74)",
        color: colors.cream,
        fontFamily: '"Manrope Promo", "Noto Sans SC Variable", sans-serif',
        fontSize: 19,
        fontWeight: 650,
        letterSpacing: 1.2,
        opacity: interpolate(frame, [0, 12], [0, 0.78], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
      }}
    >
      {text}
    </Interactive.Div>
  );
}

export const scatteredModuleOffsets = [
  { x: -300, y: -210 },
  { x: -40, y: -285 },
  { x: 280, y: -188 },
  { x: -365, y: 20 },
  { x: 0, y: 0 },
  { x: 350, y: 32 },
  { x: -280, y: 235 },
  { x: 35, y: 300 },
  { x: 300, y: 220 },
] as const;
