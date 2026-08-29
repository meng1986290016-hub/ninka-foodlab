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
import type { Segment09EndCardProps } from "./schema";

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

export function Segment09EndCard({
  tagline,
  repositoryPath,
  bedVolume,
  sfxVolume,
}: Segment09EndCardProps) {
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
        name="Segment 08 continuous brand glow"
        style={{
          position: "absolute",
          inset: -160,
          zIndex: 10,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, rgba(239,189,80,0.18) 0%, rgba(99,209,153,0.07) 18%, rgba(11,20,17,0) 54%)",
          opacity: interpolate(frame, [0, 8, 52, 107], [0.2, 0.2, 0.38, 0.18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut, easeIn],
          }),
          scale: interpolate(frame, [0, 8, 52, 107], [1.08, 1.08, 0.94, 0.98], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: [Easing.linear, easeOut, Easing.linear],
          }),
        }}
      />

      <Interactive.Div
        name="Final brand halo"
        style={{
          position: "absolute",
          left: 420,
          top: interpolate(frame, [0, 8, 44], [540, 540, 260], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut],
          }),
          zIndex: 14,
          width: 1720,
          height: 390,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse at center, rgba(255,247,231,0.08) 0%, rgba(239,189,80,0.045) 34%, transparent 72%)",
          opacity: interpolate(frame, [0, 8, 44, 107], [0.16, 0.16, 0.36, 0.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut, easeIn],
          }),
          scale: interpolate(frame, [0, 8, 44], [1, 1, 0.9], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: [Easing.linear, easeOut],
          }),
        }}
      />

      <Interactive.Div
        name="Final official Ninka FoodLab lockup"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 30,
        }}
      >
        <NinkaSymbolVector
          style={{
            position: "absolute",
            left: interpolate(frame, [0, 8, 42, 52, 107], [440, 440, 575, 570, 570], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            top: interpolate(frame, [0, 8, 42, 52, 107], [595, 595, 350, 360, 360], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            width: interpolate(frame, [0, 8, 42, 52, 107], [250, 250, 210, 214, 214], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            height: interpolate(frame, [0, 8, 42, 52, 107], [250, 250, 210, 214, 214], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: [Easing.linear, easeOut, easeOut, Easing.linear],
            }),
            filter: "drop-shadow(0 18px 60px rgba(3,10,7,0.24)) drop-shadow(0 0 16px rgba(255,247,231,0.1))",
          }}
        />
        <NinkaWordmarkVector
          left={interpolate(frame, [0, 8, 42, 52, 107], [440, 440, 575, 570, 570], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut, easeOut, Easing.linear],
          })}
          top={interpolate(frame, [0, 8, 42, 52, 107], [595, 595, 350, 360, 360], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut, easeOut, Easing.linear],
          })}
          height={interpolate(frame, [0, 8, 42, 52, 107], [250, 250, 210, 214, 214], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: [Easing.linear, easeOut, easeOut, Easing.linear],
          })}
          reveal={1}
        />
      </Interactive.Div>

      <Interactive.Div
        name="Food R&D local workspace tagline"
        style={{
          position: "absolute",
          left: 260,
          right: 260,
          top: 690,
          zIndex: 32,
          color: "rgba(255,247,231,0.88)",
          fontSize: 64,
          fontWeight: 540,
          letterSpacing: "0.08em",
          lineHeight: 1.2,
          textAlign: "center",
          opacity: interpolate(frame, [30, 52], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
          translate: interpolate(frame, [30, 52], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
        }}
      >
        {tagline}
      </Interactive.Div>

      <Interactive.Div
        name="GitHub repository address"
        style={{
          position: "absolute",
          left: 260,
          right: 260,
          top: 858,
          zIndex: 32,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
          color: "rgba(255,247,231,0.72)",
          fontSize: 42,
          fontWeight: 560,
          letterSpacing: "0.015em",
          lineHeight: 1.2,
          textAlign: "center",
          opacity: interpolate(frame, [46, 70], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
          translate: interpolate(frame, [46, 70], ["0px 18px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
        }}
      >
        <span style={{ color: colors.grain, fontSize: 38 }}>↗</span>
        <span>{repositoryPath}</span>
      </Interactive.Div>

      <Interactive.Div
        name="Cinematic edge vignette"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 70,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 47%, transparent 50%, rgba(3,10,7,0.16) 77%, rgba(3,10,7,0.38) 100%)",
        }}
      />

      <Audio
        name="Original final card rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
    </AbsoluteFill>
  );
}
