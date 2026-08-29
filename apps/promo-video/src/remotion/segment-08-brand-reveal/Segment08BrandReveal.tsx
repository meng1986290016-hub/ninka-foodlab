import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import {
  NinkaSymbolVector,
  NinkaWordmarkVector,
} from "../motion-test/brand-vectors";
import { PaperGrain } from "../reference-style-test/shared";
import { colors } from "../theme";
import type { Segment08BrandRevealProps } from "./schema";

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

export function Segment08BrandReveal({
  bedVolume,
  sfxVolume,
}: Segment08BrandRevealProps) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forestDeep,
        color: colors.cream,
        fontFamily: '"Manrope Promo", "Noto Sans SC Variable", sans-serif',
      }}
    >
      <PaperGrain dark />

      <Interactive.Div
        name="Continuous brand glow from Segment 07"
        style={{
          position: "absolute",
          inset: -160,
          zIndex: 10,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, rgba(239,189,80,0.18) 0%, rgba(99,209,153,0.07) 18%, rgba(11,20,17,0) 54%)",
          opacity: interpolate(frame, [0, 44, 95], [0.16, 0.42, 0.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [easeOut, easeIn],
          }),
          scale: interpolate(frame, [0, 58, 95], [1.1, 1.02, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: [easeOut, Easing.linear],
          }),
        }}
      />

      <Interactive.Div
        name="Horizontal brand runway"
        style={{
          position: "absolute",
          left: 420,
          top: 540,
          zIndex: 14,
          width: 1720,
          height: 390,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, rgba(255,247,231,0.08) 0%, rgba(239,189,80,0.045) 34%, transparent 72%)",
          opacity: interpolate(frame, [16, 38, 78, 95], [0, 0.62, 0.28, 0.16], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [easeOut, easeIn, Easing.linear],
          }),
          scale: interpolate(frame, [16, 58], [0.54, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: easeOut,
          }),
        }}
      />

      <Interactive.Div
        name="Official transparent Ninka FoodLab lockup journey"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 30,
        }}
      >
        <NinkaSymbolVector
          style={{
            position: "absolute",
            left: interpolate(frame, [0, 8, 54, 64, 95], [970, 970, 425, 440, 440], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            top: interpolate(frame, [0, 8, 54, 64, 95], [410, 410, 590, 595, 595], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            width: interpolate(frame, [0, 8, 54, 64, 95], [620, 620, 245, 250, 250], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            height: interpolate(frame, [0, 8, 54, 64, 95], [620, 620, 245, 250, 250], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            filter: `drop-shadow(0 0 ${interpolate(frame, [0, 52, 72], [30, 20, 14], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeOut,
            })}px rgba(255,247,231,0.16))`,
          }}
        />
        <NinkaWordmarkVector
          left={interpolate(frame, [0, 8, 54, 64, 95], [970, 970, 425, 440, 440], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut, easeOut, Easing.linear],
          })}
          top={interpolate(frame, [0, 8, 54, 64, 95], [410, 410, 590, 595, 595], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut, easeOut, Easing.linear],
          })}
          height={interpolate(frame, [0, 8, 54, 64, 95], [620, 620, 245, 250, 250], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: [Easing.linear, easeOut, easeOut, Easing.linear],
          })}
          reveal={interpolate(frame, [34, 72], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          })}
          opacity={interpolate(frame, [28, 40], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          })}
        />
      </Interactive.Div>

      <Interactive.Div
        name="Soft wordmark reveal sheen"
        style={{
          position: "absolute",
          left: interpolate(frame, [34, 72], [690, 2140], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
          top: 560,
          zIndex: 42,
          width: 190,
          height: 330,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,247,231,0.13) 50%, transparent 100%)",
          filter: "blur(24px)",
          opacity: interpolate(frame, [30, 38, 64, 76], [0, 0.55, 0.3, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [easeOut, Easing.linear, easeIn],
          }),
        }}
      />

      <Interactive.Div
        name="Cinematic edge vignette"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 70,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, transparent 52%, rgba(3,10,7,0.14) 78%, rgba(3,10,7,0.36) 100%)",
        }}
      />

      <Audio
        name="Original segment rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
    </AbsoluteFill>
  );
}
