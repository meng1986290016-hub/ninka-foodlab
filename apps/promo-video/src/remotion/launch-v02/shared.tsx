import type { ReactNode } from "react";
import {
  AbsoluteFill,
  Img,
  Interactive,
  staticFile,
} from "remotion";

import { colors } from "../theme";

export function LaunchBackground({
  children,
  light = false,
}: {
  children: ReactNode;
  light?: boolean;
}) {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: light ? colors.cream : colors.forest,
        color: light ? colors.forestDeep : colors.cream,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -240,
          background: light
            ? "radial-gradient(circle at 52% 46%, rgba(239,189,80,0.20), rgba(255,247,231,0) 52%)"
            : "radial-gradient(circle at 52% 44%, rgba(255,247,231,0.08), rgba(239,189,80,0.04) 24%, rgba(21,61,54,0) 58%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: light ? 0.18 : 0.1,
          backgroundImage: light
            ? "linear-gradient(rgba(21,61,54,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(21,61,54,0.10) 1px, transparent 1px)"
            : "radial-gradient(circle at center, rgba(255,247,231,0.70) 1px, transparent 1px)",
          backgroundSize: light ? "96px 72px" : "46px 46px",
          maskImage:
            "linear-gradient(to right, transparent, black 10%, black 90%, transparent)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

export function CaptureStage({
  image,
  name,
  opacity = 1,
  scale = 1,
  translateX = 0,
  translateY = 0,
}: {
  image: string;
  name: string;
  opacity?: number;
  scale?: number;
  translateX?: number;
  translateY?: number;
}) {
  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        left: 200,
        top: 75,
        width: 2160,
        height: 1350,
        overflow: "hidden",
        border: "1px solid rgba(255,247,231,0.20)",
        borderRadius: 34,
        opacity,
        scale,
        translate: `${translateX}px ${translateY}px`,
        transformOrigin: "50% 50%",
        backgroundColor: "#0D1713",
        boxShadow: "0 44px 130px rgba(3,10,8,0.48)",
      }}
    >
      <Img
        src={staticFile(`captures/${image}`)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </Interactive.Div>
  );
}

export function DemoBadge({ text }: { text: string }) {
  return (
    <Interactive.Div
      name="Launch animatic demo data badge"
      style={{
        position: "absolute",
        top: 44,
        right: 74,
        zIndex: 80,
        padding: "12px 22px",
        border: "1px solid rgba(239,189,80,0.52)",
        borderRadius: 999,
        backgroundColor: "rgba(10,18,15,0.78)",
        color: colors.grain,
        fontSize: 25,
        fontWeight: 720,
        letterSpacing: "0.08em",
      }}
    >
      {text}
    </Interactive.Div>
  );
}

export function AnimaticLabel({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Interactive.Div
      name="Full launch animatic review label"
      style={{
        position: "absolute",
        right: 52,
        bottom: 38,
        zIndex: 200,
        padding: "11px 18px",
        border: "1px solid rgba(255,247,231,0.20)",
        borderRadius: 999,
        backgroundColor: "rgba(9,17,14,0.58)",
        color: "rgba(255,247,231,0.70)",
        fontFamily: '"Manrope Promo", "Noto Sans SC Variable", sans-serif',
        fontSize: 22,
        fontWeight: 650,
        letterSpacing: "0.11em",
      }}
    >
      ANIMATIC · 无声预演
    </Interactive.Div>
  );
}

export function FocusCallout({
  children,
  left,
  top,
  opacity,
}: {
  children: ReactNode;
  left: number;
  top: number;
  opacity: number;
}) {
  return (
    <Interactive.Div
      name="Launch UI focus callout"
      style={{
        position: "absolute",
        left,
        top,
        zIndex: 40,
        padding: "16px 24px",
        border: "1px solid rgba(239,189,80,0.54)",
        borderRadius: 999,
        opacity,
        backgroundColor: "rgba(10,18,15,0.90)",
        color: colors.cream,
        fontSize: 28,
        fontWeight: 690,
        boxShadow: "0 18px 46px rgba(0,0,0,0.28)",
      }}
    >
      {children}
    </Interactive.Div>
  );
}

export function CursorActor({
  left,
  top,
  opacity = 1,
  pressed = false,
}: {
  left: number;
  top: number;
  opacity?: number;
  pressed?: boolean;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        zIndex: 70,
        width: 42,
        height: 58,
        opacity,
        scale: pressed ? 0.88 : 1,
        filter: "drop-shadow(0 7px 12px rgba(0,0,0,0.45))",
      }}
    >
      <svg viewBox="0 0 42 58" width="42" height="58" aria-hidden="true">
        <path
          d="M4 3L36 34L22 36L16 53L9 50L15 34L4 3Z"
          fill="#FFF7E7"
          stroke="#153D36"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function AgentConversationCover({ opacity = 1 }: { opacity?: number }) {
  return (
    <div
      style={{
        position: "absolute",
        zIndex: 24,
        left: 520,
        top: 160,
        right: 200,
        bottom: 15,
        opacity,
        backgroundColor: "#0D1713",
        borderBottomRightRadius: 34,
      }}
    />
  );
}
