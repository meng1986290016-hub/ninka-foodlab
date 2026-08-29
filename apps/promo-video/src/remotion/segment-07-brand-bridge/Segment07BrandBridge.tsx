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
  NinkaSymbolModuleShape,
  ninkaSymbolModules,
} from "../motion-test/brand-vectors";
import { PaperGrain } from "../reference-style-test/shared";
import { Segment06AgentProposal } from "../segment-06-agent-proposal/Segment06AgentProposal";
import { colors } from "../theme";
import type { Segment07BrandBridgeProps } from "./schema";

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);

const moduleOrigins = [
  { x: 365, y: 255 },
  { x: 1440, y: 310 },
  { x: 360, y: 410 },
  { x: 1440, y: 410 },
  { x: 360, y: 570 },
  { x: 1440, y: 570 },
  { x: 360, y: 730 },
  { x: 1440, y: 730 },
  { x: 360, y: 930 },
] as const;

const moduleTargets = [
  { x: 1280, y: 588 },
  { x: 1346, y: 654 },
  { x: 1412, y: 720 },
  { x: 1214, y: 654 },
  { x: 1280, y: 720 },
  { x: 1346, y: 786 },
  { x: 1148, y: 720 },
  { x: 1214, y: 786 },
  { x: 1280, y: 852 },
] as const;

function ExactLogoModuleFlights() {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name="Nine native Ninka modules extracted from the recipe"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 34,
      }}
    >
      {ninkaSymbolModules.map((module, index) => {
        const origin = moduleOrigins[index]!;
        const target = moduleTargets[index]!;
        const start = 10 + index * 2;
        const end = 56 + index * 1.25;

        return (
          <Interactive.Svg
            key={module.id}
            name={`Native logo module ${index + 1}`}
            viewBox="0 0 1024 1024"
            style={{
              position: "absolute",
              left: 970,
              top: 410,
              width: 620,
              height: 620,
              zIndex: 30 + index,
              overflow: "visible",
              transformOrigin: `${target.x - 970}px ${target.y - 410}px`,
              translate: interpolate(
                frame,
                [start, end],
                [
                  `${origin.x - target.x}px ${origin.y - target.y}px`,
                  "0px 0px",
                ],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.4, 0, 0.2, 1),
                },
              ),
              scale: interpolate(frame, [start, end], [0.38, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
                easing: Easing.bezier(0.4, 0, 0.2, 1),
              }),
              opacity: interpolate(frame, [start - 3, start + 3, end], [0, 1, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: [easeOut, Easing.linear],
              }),
              filter: `drop-shadow(0 0 ${interpolate(frame, [start, end], [10, 30], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.4, 0, 0.2, 1),
              })}px rgba(255,247,231,0.16))`,
            }}
          >
            <g transform="rotate(45 512 512)">
              <NinkaSymbolModuleShape module={module} />
            </g>
          </Interactive.Svg>
        );
      })}
    </Interactive.Div>
  );
}

export function Segment07BrandBridge({
  bedVolume,
  formulaPrompt,
  sfxVolume,
}: Segment07BrandBridgeProps) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forestDeep,
        color: colors.cream,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <PaperGrain dark />

      <Interactive.Div
        name="Exact continuation from the accepted recipe result"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 20,
          opacity: interpolate(frame, [10, 18, 40, 48], [1, 1, 0.2, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [Easing.linear, easeOut, easeIn],
          }),
          scale: interpolate(frame, [10, 48], [1, 1.065], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: easeOut,
          }),
          translate: interpolate(frame, [10, 48], ["0px 0px", "0px -22px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
          filter: `blur(${interpolate(frame, [16, 46], [0, 16], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          })}px)`,
        }}
      >
        <Sequence from={-212}>
          <Segment06AgentProposal
            formulaPrompt={formulaPrompt}
            bedVolume={0}
            sfxVolume={0}
          />
        </Sequence>
      </Interactive.Div>

      <Interactive.Div
        name="Recipe information dissolves toward the brand center"
        style={{
          position: "absolute",
          inset: -160,
          zIndex: 24,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, rgba(239,189,80,0.20) 0%, rgba(99,209,153,0.08) 18%, rgba(11,20,17,0) 52%)",
          opacity: interpolate(frame, [20, 44, 66, 89], [0, 0.68, 0.34, 0.16], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [easeOut, easeIn, Easing.linear],
          }),
          scale: interpolate(frame, [20, 66, 89], [0.68, 1.04, 1.1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: [easeOut, Easing.linear],
          }),
        }}
      />

      <ExactLogoModuleFlights />

      <Interactive.Div
        name="Vector logo convergence confirmation"
        style={{
          position: "absolute",
          left: 854,
          top: 294,
          zIndex: 32,
          width: 852,
          height: 852,
          borderRadius: 9999,
          border: "2px solid rgba(239,189,80,0.22)",
          opacity: interpolate(frame, [48, 60, 78, 89], [0, 0.5, 0.16, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [easeOut, easeIn, Easing.linear],
          }),
          scale: interpolate(frame, [48, 78], [0.52, 1.12], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: easeOut,
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
      <Sequence from={8} durationInFrames={52} layout="none">
        <Audio
          name="Recipe modules gathering move"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.78}
          volume={sfxVolume * 0.38}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
