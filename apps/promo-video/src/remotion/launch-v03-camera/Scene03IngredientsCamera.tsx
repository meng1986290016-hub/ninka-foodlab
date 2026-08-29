import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import { colors } from "../theme";
import { PaperGrain } from "../reference-style-test/shared";
import {
  CameraCursor,
  CameraImage,
  CameraUI,
  ClickPulse,
} from "./CameraUI";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export function Scene03IngredientsCamera() {
  const frame = useCurrentFrame();
  const points = [0, 24, 34, 56, 74, 101, 142, 149];
  const translateX = interpolate(
    frame,
    points,
    [0, 0, 0, -170, -170, -1980, -1980, -2020],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [ease, Easing.linear, ease, Easing.linear, ease, Easing.linear, ease],
    },
  );
  const translateY = interpolate(
    frame,
    points,
    [110, 0, 0, -670, -670, -520, -520, -550],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [ease, Easing.linear, ease, Easing.linear, ease, Easing.linear, ease],
    },
  );
  const scale = interpolate(
    frame,
    points,
    [0.78, 0.96, 0.96, 1.82, 1.82, 1.68, 1.68, 1.73],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      output: "perceptual-scale",
      easing: [ease, Easing.linear, ease, Easing.linear, ease, Easing.linear, ease],
    },
  );

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <PaperGrain dark />
      <div
        style={{
          position: "absolute",
          left: -220,
          top: -520,
          width: 1380,
          height: 1380,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(239,189,80,0.24) 0%, rgba(239,189,80,0.05) 44%, transparent 72%)",
        }}
      />
      <CameraUI
        name="Ingredient library continuous camera"
        translateX={translateX}
        translateY={translateY}
        scale={scale}
        opacity={interpolate(frame, [0, 10], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        blur={interpolate(frame, [0, 15], [12, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
      >
        <CameraImage
          image="ingredients-nutrition.png"
          name="Ingredient library with native cocoa selection"
        />
        <ClickPulse
          left={722}
          top={676}
          opacity={interpolate(frame, [61, 64, 74], [0, 0.62, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, ease],
          })}
          scale={interpolate(frame, [61, 74], [0.25, 1.35], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: ease,
          })}
        />
        <CameraCursor
          left={interpolate(frame, [50, 60], [860, 760], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          top={interpolate(frame, [50, 60], [610, 710], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          opacity={interpolate(frame, [49, 53, 70, 76], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          pressed={frame >= 61 && frame <= 66}
        />
      </CameraUI>
    </AbsoluteFill>
  );
}
