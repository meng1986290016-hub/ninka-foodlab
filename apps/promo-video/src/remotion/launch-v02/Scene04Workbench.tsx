import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import type { LaunchV02Props } from "./schema";
import {
  CaptureStage,
  CursorActor,
  DemoBadge,
  LaunchBackground,
} from "./shared";

const cascade = [
  ["投料合计", "1.004 kg"],
  ["得率", "99.6%"],
  ["整批能量", "1200 kJ"],
  ["整批成本", "4.37 元"],
] as const;

export function Scene04Workbench(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const cameraScale = interpolate(frame, [0, 167], [1, 1.045], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <LaunchBackground>
      <CaptureStage
        image="workbench-before.png"
        name="Recipe workbench before cocoa adjustment"
        scale={cameraScale}
        opacity={interpolate(frame, [78, 104], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <CaptureStage
        image="workbench-after.png"
        name="Recipe workbench after deterministic recalculation"
        scale={cameraScale}
        opacity={interpolate(frame, [78, 104], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 36,
          left: 972,
          top: 834,
          width: 205,
          height: 64,
          border: `3px solid ${colors.grain}`,
          borderRadius: 14,
          opacity: interpolate(frame, [16, 28, 98, 118], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          boxShadow: "0 0 0 10px rgba(239,189,80,0.08)",
        }}
      />
      <Interactive.Div
        name="Cocoa amount typing overlay"
        style={{
          position: "absolute",
          zIndex: 42,
          left: 990,
          top: 844,
          width: 168,
          height: 44,
          borderRadius: 8,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          paddingRight: 20,
          opacity: interpolate(frame, [38, 50, 79, 96], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          backgroundColor: "#0D1713",
          color: colors.cream,
          fontFamily: '"Manrope Promo", sans-serif',
          fontSize: 29,
          fontWeight: 760,
        }}
      >
        {frame < 58 ? "3" : "32"}
      </Interactive.Div>
      <CursorActor
        left={interpolate(frame, [0, 28], [1450, 1118], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        top={interpolate(frame, [0, 28], [1120, 868], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        pressed={frame >= 26 && frame <= 31}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 45,
          right: 235,
          top: 250,
          width: 470,
          display: "grid",
          gap: 12,
        }}
      >
        {cascade.map(([label, value], index) => (
          <Interactive.Div
            key={label}
            name={`Deterministic metric cascade ${index + 1}`}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "18px 22px",
              border: "1px solid rgba(239,189,80,0.42)",
              borderRadius: 16,
              opacity: interpolate(
                frame,
                [78 + index * 10, 92 + index * 10, 148, 163],
                [0, 1, 1, 0],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
              translate: interpolate(
                frame,
                [78 + index * 10, 92 + index * 10],
                ["22px 0px", "0px 0px"],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                },
              ),
              backgroundColor: "rgba(10,18,15,0.88)",
              color: colors.cream,
              fontSize: 25,
            }}
          >
            <span style={{ color: "rgba(255,247,231,0.62)" }}>{label}</span>
            <strong style={{ color: colors.grain }}>{value}</strong>
          </Interactive.Div>
        ))}
      </div>
      <Interactive.Div
        name="Recipe recalculation statement"
        style={{
          position: "absolute",
          zIndex: 50,
          left: 0,
          right: 0,
          bottom: 86,
          textAlign: "center",
          color: colors.cream,
          fontSize: 62,
          fontWeight: 720,
          opacity: interpolate(frame, [104, 122, 151, 166], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          textShadow: "0 12px 42px rgba(0,0,0,0.58)",
        }}
      >
        {props.recalcStatement}
      </Interactive.Div>
      <DemoBadge text={props.demoBadge} />
    </LaunchBackground>
  );
}
