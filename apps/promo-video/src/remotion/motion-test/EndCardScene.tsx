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
import { motionTestFrames, proposalBridgeDuration } from "./timing";

export function EndCardScene(props: MotionTestProps) {
  const frame = useCurrentFrame();
  const lockupLeft = interpolate(frame, [0, 28], [440, 700], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const lockupTop = interpolate(frame, [0, 28], [595, 466], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const lockupHeight = interpolate(frame, [0, 28], [250, 172], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forest,
        color: colors.cream,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <BrandAtmosphere
        phase={proposalBridgeDuration + motionTestFrames.brandCrescendo}
      />
      <Interactive.Div
        name="Final official Ninka FoodLab lockup"
        style={{
          position: "absolute",
          inset: 0,
        }}
      >
        <NinkaSymbolVector
          style={{
            position: "absolute",
            left: lockupLeft,
            top: lockupTop,
            width: lockupHeight,
            height: lockupHeight,
            filter: "drop-shadow(0 28px 80px rgba(7,15,12,0.24))",
          }}
        />
        <NinkaWordmarkVector
          left={lockupLeft}
          top={lockupTop}
          height={lockupHeight}
          reveal={1}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Food R&D local workspace tagline"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 740,
          textAlign: "center",
          color: "rgba(255,247,231,0.86)",
          fontSize: 76,
          fontWeight: 560,
          letterSpacing: "0.04em",
          opacity: interpolate(frame, [18, 42], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: `0px ${interpolate(frame, [18, 42], [32, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px`,
        }}
      >
        {props.tagline}
      </Interactive.Div>
      {props.cta ? (
        <Interactive.Div
          name="Optional final CTA"
          style={{
            position: "absolute",
            left: "50%",
            top: 896,
            translate: "-50% 0",
            padding: "18px 30px",
            border: `1px solid ${colors.grain}`,
            borderRadius: 999,
            color: colors.grain,
            fontSize: 30,
            fontWeight: 700,
            opacity: interpolate(frame, [36, 56], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {props.cta}
        </Interactive.Div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: "50%",
          bottom: 140,
          width: interpolate(frame, [24, 54], [0, 220], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          height: 2,
          translate: "-50% 0",
          backgroundColor: "rgba(239,189,80,0.48)",
          opacity: interpolate(frame, [70, 101], [0.75, 0.34], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <MotionTestLabel visible={props.showReviewLabel} />
    </AbsoluteFill>
  );
}
