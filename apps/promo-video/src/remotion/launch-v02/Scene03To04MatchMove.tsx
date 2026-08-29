import { Easing, interpolate, useCurrentFrame } from "remotion";

import { colors } from "../theme";
import type { LaunchV02Props } from "./schema";
import { CaptureStage, DemoBadge, LaunchBackground } from "./shared";

export function Scene03To04MatchMove(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  return (
    <LaunchBackground>
      <CaptureStage
        image="ingredients-nutrition.png"
        name="Ingredient library receding during cocoa match move"
        scale={interpolate(frame, [0, 23], [1.035, 1.12], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        opacity={interpolate(frame, [0, 17], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <CaptureStage
        image="workbench-before.png"
        name="Workbench forming around the same cocoa row"
        scale={interpolate(frame, [7, 23], [1.08, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        opacity={interpolate(frame, [7, 23], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 55,
          left: interpolate(frame, [0, 23], [510, 602], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          top: interpolate(frame, [0, 23], [727, 790], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          width: interpolate(frame, [0, 23], [468, 720], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          height: interpolate(frame, [0, 23], [98, 86], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 30px",
          border: "2px solid rgba(239,189,80,0.70)",
          borderRadius: 18,
          backgroundColor: "rgba(18,33,28,0.96)",
          color: colors.cream,
          fontSize: 28,
          fontWeight: 720,
          boxShadow: "0 26px 70px rgba(0,0,0,0.40)",
        }}
      >
        <span>可可粉 · 低脂可可粉 CP-10</span>
        <span
          style={{
            color: colors.grain,
            opacity: interpolate(frame, [10, 20], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          28 g
        </span>
      </div>
      <DemoBadge text={props.demoBadge} />
    </LaunchBackground>
  );
}
