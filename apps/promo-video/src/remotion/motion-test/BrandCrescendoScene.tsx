import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import { NinkaSymbolVector, NinkaWordmarkVector } from "./brand-vectors";
import type { MotionTestProps } from "./schema";
import { BrandAtmosphere, MotionTestLabel } from "./shared";
import { proposalBridgeDuration } from "./timing";

export function BrandCrescendoScene(props: MotionTestProps) {
  const frame = useCurrentFrame();
  const symbolLeft = interpolate(frame, [12, 68], [970, 440], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const symbolTop = interpolate(frame, [12, 68], [410, 595], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const symbolSize = interpolate(frame, [12, 68], [620, 250], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const wordmarkReveal = interpolate(frame, [48, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <BrandAtmosphere phase={proposalBridgeDuration} />
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          style={{
            position: "absolute",
            left: 650,
            top: 635 + index * 80,
            height: 2,
            width: interpolate(frame, [22 + index * 5, 68 + index * 4], [0, 1180], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            backgroundColor:
              index === 1
                ? "rgba(223,107,69,0.18)"
                : "rgba(239,189,80,0.14)",
            opacity: interpolate(frame, [18, 38, 78, 92], [0, 0.8, 0.35, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        />
      ))}
      <Interactive.Div
        name="Official Ninka symbol journey"
        style={{ position: "absolute", inset: 0 }}
      >
        <NinkaSymbolVector
          style={{
            position: "absolute",
            left: symbolLeft,
            top: symbolTop,
            width: symbolSize,
            height: symbolSize,
            filter: "drop-shadow(0 28px 70px rgba(7,15,12,0.24))",
          }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Official Ninka FoodLab wordmark reveal"
        style={{ position: "absolute", inset: 0 }}
      >
        <NinkaWordmarkVector
          left={symbolLeft}
          top={symbolTop}
          height={symbolSize}
          reveal={wordmarkReveal}
          opacity={interpolate(frame, [48, 56], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
      </Interactive.Div>
      <MotionTestLabel visible={props.showReviewLabel} />
    </AbsoluteFill>
  );
}
