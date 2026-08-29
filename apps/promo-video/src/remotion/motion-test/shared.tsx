import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";

const particles = [
  { x: 0.08, y: 0.21, size: 4, drift: 34 },
  { x: 0.17, y: 0.76, size: 3, drift: -22 },
  { x: 0.28, y: 0.14, size: 5, drift: 26 },
  { x: 0.39, y: 0.86, size: 3, drift: -28 },
  { x: 0.52, y: 0.18, size: 3, drift: 20 },
  { x: 0.61, y: 0.72, size: 4, drift: -30 },
  { x: 0.73, y: 0.28, size: 3, drift: 24 },
  { x: 0.84, y: 0.82, size: 5, drift: -18 },
  { x: 0.92, y: 0.42, size: 3, drift: 28 },
] as const;

export function BrandAtmosphere({ phase = 0 }: { phase?: number }) {
  const frame = useCurrentFrame() + phase;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.forest,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -180,
          background:
            "radial-gradient(circle at 50% 46%, rgba(255,247,231,0.10) 0%, rgba(239,189,80,0.055) 20%, rgba(21,61,54,0) 56%)",
          opacity: 0.9,
          scale: interpolate(frame, [0, 267], [0.98, 1.04], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,247,231,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,247,231,0.025) 1px, transparent 1px)",
          backgroundSize: "96px 96px",
          opacity: 0.32,
          translate: `${interpolate(frame, [0, 267], [0, -24], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px ${interpolate(frame, [0, 267], [0, 18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px`,
        }}
      />
      {particles.map((particle, index) => (
        <div
          key={`${particle.x}-${particle.y}`}
          style={{
            position: "absolute",
            left: `${particle.x * 100}%`,
            top: `${particle.y * 100}%`,
            width: particle.size,
            height: particle.size,
            borderRadius: 999,
            backgroundColor:
              index % 4 === 0 ? colors.grain : "rgba(255,247,231,0.42)",
            opacity: 0.22 + (index % 3) * 0.06,
            translate: `0px ${Math.sin((frame + index * 11) / 34) * particle.drift}px`,
            boxShadow: "0 0 18px rgba(255,247,231,0.15)",
          }}
        />
      ))}
    </AbsoluteFill>
  );
}

export function MotionTestLabel({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Interactive.Div
      name="Motion test review label"
      style={{
        position: "absolute",
        bottom: 48,
        right: 64,
        zIndex: 100,
        padding: "13px 20px",
        border: "1px solid rgba(255,247,231,0.22)",
        borderRadius: 999,
        backgroundColor: "rgba(11,20,17,0.42)",
        color: "rgba(255,247,231,0.72)",
        fontFamily: '"Manrope Promo", "Noto Sans SC Variable", sans-serif',
        fontSize: 24,
        fontWeight: 650,
        letterSpacing: "0.12em",
      }}
    >
      MOTION TEST · 无声预演
    </Interactive.Div>
  );
}
