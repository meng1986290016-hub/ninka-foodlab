import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { colors } from "../theme";
import { CameraImage, CameraUI } from "./CameraUI";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export function Scene03To04CameraBridge() {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <CameraUI
        name="Ingredient nutrition panel leaving frame"
        translateX={interpolate(frame, [0, 23], [-2020, -2600], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        translateY={interpolate(frame, [0, 23], [-550, -760], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        scale={interpolate(frame, [0, 23], [1.73, 2.2], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          output: "perceptual-scale",
          easing: ease,
        })}
        opacity={interpolate(frame, [0, 14], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        blur={interpolate(frame, [2, 16], [0, 11], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
      >
        <CameraImage image="ingredients-nutrition.png" name="Cocoa nutrition anchor" />
      </CameraUI>
      <CameraUI
        name="Workbench cocoa row entering frame"
        translateX={interpolate(frame, [5, 23], [-620, -370], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        translateY={interpolate(frame, [5, 23], [-940, -803], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        scale={interpolate(frame, [5, 23], [2.06, 1.75], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          output: "perceptual-scale",
          easing: ease,
        })}
        opacity={interpolate(frame, [5, 19], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        blur={interpolate(frame, [5, 20], [10, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
      >
        <CameraImage image="workbench-before.png" name="Native cocoa row in workbench" />
      </CameraUI>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(100deg, transparent 42%, ${colors.grain} 50%, transparent 58%)`,
          opacity: interpolate(frame, [6, 11, 18], [0, 0.13, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: `${interpolate(frame, [6, 18], [-900, 900], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}px 0px`,
        }}
      />
    </AbsoluteFill>
  );
}
