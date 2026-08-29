import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import type { LaunchV02Props } from "../launch-v02/schema";
import {
  CameraCursor,
  CameraImage,
  CameraUI,
  ClickPulse,
} from "./CameraUI";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export function Scene04WorkbenchCamera(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const points = [0, 55, 72, 96, 112, 142, 167];
  const translateX = interpolate(
    frame,
    points,
    [-370, -370, -165, -165, -1525, -1525, -1460],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [Easing.linear, ease, Easing.linear, ease, Easing.linear, ease],
    },
  );
  const translateY = interpolate(
    frame,
    points,
    [-803, -803, -53, -53, -298, -298, -250],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [Easing.linear, ease, Easing.linear, ease, Easing.linear, ease],
    },
  );
  const scale = interpolate(
    frame,
    points,
    [1.75, 1.75, 1.55, 1.55, 1.55, 1.55, 1.52],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      output: "perceptual-scale",
      easing: [Easing.linear, ease, Easing.linear, ease, Easing.linear, ease],
    },
  );
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <CameraUI
        name="Recipe workbench continuous camera"
        translateX={translateX}
        translateY={translateY}
        scale={scale}
      >
        <CameraImage
          image="workbench-before.png"
          name="Workbench before native cocoa edit"
          opacity={interpolate(frame, [52, 53], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <CameraImage
          image="workbench-after.png"
          name="Workbench after deterministic recalculation"
          opacity={interpolate(frame, [52, 53], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <ClickPulse
          left={865}
          top={776}
          opacity={interpolate(frame, [17, 20, 29], [0, 0.58, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          scale={interpolate(frame, [17, 29], [0.25, 1.25], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: ease,
          })}
        />
        <CameraCursor
          left={interpolate(frame, [5, 18], [1090, 930], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          top={interpolate(frame, [5, 18], [700, 825], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          opacity={interpolate(frame, [3, 7, 47, 56], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          pressed={frame >= 18 && frame <= 23}
        />
      </CameraUI>
      <Interactive.Div
        name="Deterministic recalculation statement"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 66,
          zIndex: 80,
          color: colors.cream,
          textAlign: "center",
          fontSize: 54,
          fontWeight: 710,
          letterSpacing: "0.01em",
          opacity: interpolate(frame, [116, 130, 151, 166], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          }),
          textShadow: "0 12px 38px rgba(0,0,0,0.72)",
        }}
      >
        {props.recalcStatement}
      </Interactive.Div>
    </AbsoluteFill>
  );
}
