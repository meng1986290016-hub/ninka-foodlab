import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  interpolateColors,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import {
  NinkaSymbolModuleShape,
  ninkaSymbolModules,
} from "../motion-test/brand-vectors";
import { colors } from "../theme";
import type { Segment02ProductRevealProps } from "./schema";

const initialModuleOffsets = [
  { x: -240, y: -190 },
  { x: 0, y: -270 },
  { x: 240, y: -190 },
  { x: -310, y: 0 },
  { x: 0, y: 0 },
  { x: 310, y: 0 },
  { x: -240, y: 210 },
  { x: 0, y: 290 },
  { x: 240, y: 210 },
] as const;

const moduleTickFrames = [8, 11, 14, 17, 20, 23, 26, 29, 32];

export function Segment02ProductReveal({
  bedVolume,
  positioning,
  sfxVolume,
}: Segment02ProductRevealProps) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: interpolateColors(
          frame,
          [18, 46],
          [colors.cream, colors.forestDeep],
        ),
        color: colors.cream,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 50% 46%, rgba(239,189,80,0.18), transparent 37%), radial-gradient(circle at 82% 76%, rgba(223,107,69,0.10), transparent 42%)",
          opacity: interpolate(frame, [15, 46, 100], [0.72, 0.46, 0.18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,247,231,0.36) 0 1px, transparent 1.5px)",
          backgroundSize: "52px 52px",
          opacity: interpolate(frame, [16, 44], [0, 0.13], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />

      <Interactive.Div
        name="Product interface reveal"
        style={{
          position: "absolute",
          left: 180,
          top: 88,
          zIndex: 10,
          width: 2200,
          height: 1375,
          overflow: "hidden",
          border: "2px solid rgba(255,247,231,0.18)",
          borderRadius: 42,
          backgroundColor: colors.forestDeep,
          boxShadow: "0 64px 150px rgba(4,12,9,0.50)",
          clipPath: `circle(${interpolate(frame, [52, 96], [0, 2820], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}px at 42px 52px)`,
          scale: interpolate(frame, [52, 96, 131], [0.86, 0.94, 0.96], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
            ],
            output: "perceptual-scale",
          }),
          transformOrigin: "42px 52px",
        }}
      >
        <CanvasImage
          name="Ninka FoodLab product interface"
          src={staticFile("captures/ingredients.png")}
          width={2200}
          height={1375}
          style={{ position: "absolute", inset: 0 }}
        />
        <Interactive.Div
          name="Temporary screenshot-logo mask"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 76,
            height: 108,
            backgroundColor: colors.forestDeep,
            opacity: interpolate(frame, [52, 88, 100], [1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, Easing.bezier(0.16, 1, 0.3, 1)],
            }),
          }}
        />
      </Interactive.Div>

      <Interactive.Div
        name="Product positioning statement"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: 970,
          zIndex: 22,
          color: colors.cream,
          fontSize: 62,
          fontWeight: 650,
          letterSpacing: "0.08em",
          textAlign: "center",
          opacity: interpolate(frame, [30, 40, 58, 72], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.7, 0, 0.84, 0),
            ],
          }),
          translate: interpolate(frame, [30, 40, 58, 72], ["0px 28px", "0px 0px", "0px 0px", "0px -18px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.7, 0, 0.84, 0),
            ],
          }),
        }}
      >
        {positioning}
      </Interactive.Div>

      <Interactive.Div
        name="Exact Ninka symbol journey"
        style={{
          position: "absolute",
          left: interpolate(frame, [50, 82], [1040, 194], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.2, 1),
          }),
          top: interpolate(frame, [50, 82], [276, 111], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.2, 1),
          }),
          zIndex: 30,
          width: interpolate(frame, [50, 82], [480, 56], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.2, 1),
          }),
          height: interpolate(frame, [50, 82], [480, 56], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.2, 1),
          }),
          opacity: interpolate(frame, [0, 7, 84, 100], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          filter: "drop-shadow(0 22px 44px rgba(5,14,11,0.24))",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "22%",
            backgroundColor: colors.forest,
            boxShadow: "inset 0 1px 0 rgba(255,247,231,0.10)",
            opacity: interpolate(frame, [24, 38], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            scale: interpolate(frame, [24, 38], [0.76, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
              output: "perceptual-scale",
            }),
          }}
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 1024 1024"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
          }}
        >
          <g transform="rotate(45 512 512)">
            {ninkaSymbolModules.map((module, index) => {
              const offset = initialModuleOffsets[index]!;
              return (
                <g
                  key={module.id}
                  transform={`translate(${interpolate(frame, [7 + index, 38 + index * 0.5], [offset.x, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  })} ${interpolate(frame, [7 + index, 38 + index * 0.5], [offset.y, 0], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  })}) scale(${interpolate(frame, [7 + index, 38 + index * 0.5], [0.72, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  })})`}
                >
                  <NinkaSymbolModuleShape module={module} />
                </g>
              );
            })}
          </g>
        </svg>
      </Interactive.Div>

      <Audio
        name="Original product-reveal rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
      {moduleTickFrames.map((tickFrame, index) => (
        <Sequence key={tickFrame} from={tickFrame} durationInFrames={9} layout="none">
          <Audio
            name={`Brand module tick ${index + 1}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            playbackRate={0.96 + index * 0.018}
            volume={sfxVolume * 0.24}
          />
        </Sequence>
      ))}
      <Sequence from={52} durationInFrames={44} layout="none">
        <Audio
          name="Product interface expansion"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.9}
          volume={sfxVolume * 0.38}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
