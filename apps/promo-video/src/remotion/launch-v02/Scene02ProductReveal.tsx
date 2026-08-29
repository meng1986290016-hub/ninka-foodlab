import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  interpolateColors,
  useCurrentFrame,
} from "remotion";

import { NinkaSymbolVector } from "../motion-test/brand-vectors";
import { colors } from "../theme";
import { OpeningModules } from "./OpeningModules";
import type { LaunchV02Props } from "./schema";
import { CaptureStage } from "./shared";

export function Scene02ProductReveal(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: interpolateColors(
          frame,
          [0, 38],
          [colors.cream, colors.forest],
        ),
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: -220,
          background:
            "radial-gradient(circle at 50% 48%, rgba(239,189,80,0.15), rgba(21,61,54,0) 54%)",
        }}
      />
      {frame < 37 ? <OpeningModules phase={90} /> : null}
      {frame >= 37 ? (
        <NinkaSymbolVector
          style={{
            position: "absolute",
            zIndex: 24,
            left: interpolate(frame, [37, 68], [970, 215], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            top: interpolate(frame, [37, 68], [410, 98], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            width: interpolate(frame, [37, 68], [620, 54], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            height: interpolate(frame, [37, 68], [620, 54], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            opacity: interpolate(frame, [62, 74], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
            filter: "drop-shadow(0 24px 48px rgba(7,15,12,0.20))",
          }}
        />
      ) : null}
      <Interactive.Div
        name="Product positioning statement"
        style={{
          position: "absolute",
          zIndex: 22,
          left: 0,
          right: 0,
          top: 980,
          textAlign: "center",
          color: colors.cream,
          fontSize: 66,
          fontWeight: 650,
          letterSpacing: "0.06em",
          opacity: interpolate(frame, [28, 43, 56, 69], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [28, 43], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {props.positioning}
      </Interactive.Div>
      <CaptureStage
        image="ingredients.png"
        name="Product reveal into the latest ingredient library"
        opacity={interpolate(frame, [48, 78], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        scale={interpolate(frame, [48, 83], [0.91, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
    </AbsoluteFill>
  );
}
