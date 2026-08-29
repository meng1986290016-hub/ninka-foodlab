import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Freeze,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import {
  CameraCursor,
  CameraImage,
  CameraUI,
  ClickPulse,
} from "../launch-v03-camera/CameraUI";
import { PaperGrain } from "../reference-style-test/shared";
import { Segment05AgentCapabilities } from "../segment-05-agent-capabilities/Segment05AgentCapabilities";
import { colors } from "../theme";
import { getCharacterRevealFrames } from "../typing-timing";
import type { Segment06AgentProposalProps } from "./schema";

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);
const FORMULA_TYPING_START_FRAME = 20;
const FORMULA_TYPING_END_FRAME = 64;

export function Segment06AgentProposal({
  bedVolume,
  formulaPrompt,
  sfxVolume,
}: Segment06AgentProposalProps) {
  const frame = useCurrentFrame();
  const typedCharacters = Math.floor(
    interpolate(
      frame,
      [FORMULA_TYPING_START_FRAME, FORMULA_TYPING_END_FRAME],
      [0, formulaPrompt.length],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    ),
  );
  const formulaTickFrames = getCharacterRevealFrames({
    characterCount: formulaPrompt.length,
    endFrame: FORMULA_TYPING_END_FRAME,
    startFrame: FORMULA_TYPING_START_FRAME,
  });

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
        name="Native Agent input and processing camera"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 38,
          opacity: interpolate(frame, [128, 138], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeIn,
          }),
        }}
      >
        <CameraUI
          name="Native Agent formula input and processing"
          translateX={interpolate(
            frame,
            [0, 18, 64, 78, 92, 138],
            [-120, -480, -480, -610, -430, -430],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [easeOut, Easing.linear, easeOut, easeOut, Easing.linear],
            },
          )}
          translateY={interpolate(
            frame,
            [0, 18, 64, 78, 92, 138],
            [-230, -1040, -1040, -700, -700, -700],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [easeOut, Easing.linear, easeOut, easeOut, Easing.linear],
            },
          )}
          scale={interpolate(
            frame,
            [0, 18, 64, 78, 92, 138],
            [1.16, 1.28, 1.28, 1.3, 1.34, 1.34],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: [easeOut, Easing.linear, easeOut, easeOut, Easing.linear],
            },
          )}
        >
          <CameraImage
            image="agent-v02-input.png"
            name="Real Agent formula input"
            opacity={interpolate(frame, [72, 82], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeIn,
            })}
          />
          <CameraImage
            image="agent-v02-progress.png"
            name="Real Agent processing output"
            opacity={interpolate(frame, [72, 82], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeOut,
            })}
          />

          <Interactive.Div
            name="Native input text cleanup"
            style={{
              position: "absolute",
              left: 402,
              top: 1167,
              zIndex: 22,
              width: 1570,
              height: 64,
              backgroundColor: "#0C1813",
              opacity: interpolate(frame, [70, 80], [1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeIn,
              }),
            }}
          />
          <Interactive.Div
            name="Formula prompt aligned inside native composer"
            style={{
              position: "absolute",
              left: 411,
              top: 1178,
              zIndex: 24,
              width: 1540,
              minHeight: 42,
              color: colors.cream,
              fontSize: 20,
              fontWeight: 520,
              lineHeight: 1.55,
              letterSpacing: 0,
              opacity: interpolate(frame, [16, 20, 70, 80], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: [easeOut, Easing.linear, easeIn],
              }),
            }}
          >
            {formulaPrompt.slice(0, typedCharacters)}
            {frame <= 67 ? (
              <span
                style={{
                  color: "#63D199",
                  opacity: frame % 16 < 8 ? 1 : 0.28,
                }}
              >
                │
              </span>
            ) : null}
          </Interactive.Div>
          <ClickPulse
            left={920}
            top={1144}
            opacity={interpolate(frame, [15, 19, 29], [0, 0.58, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut],
            })}
            scale={interpolate(frame, [15, 29], [0.2, 1.28], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: easeOut,
            })}
          />
          <ClickPulse
            left={2048}
            top={1260}
            opacity={interpolate(frame, [65, 69, 79], [0, 0.68, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut],
            })}
            scale={interpolate(frame, [65, 79], [0.2, 1.34], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: easeOut,
            })}
          />
          <CameraCursor
            left={interpolate(frame, [8, 18, 56, 68], [1340, 980, 980, 2095], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [easeOut, Easing.linear, easeOut],
            })}
            top={interpolate(frame, [8, 18, 56, 68], [1030, 1190, 1190, 1300], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [easeOut, Easing.linear, easeOut],
            })}
            opacity={interpolate(frame, [7, 12, 70, 80], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            pressed={(frame >= 17 && frame <= 21) || (frame >= 67 && frame <= 71)}
          />

          <Interactive.Div
            name="Soft processing status glow"
            style={{
              position: "absolute",
              left: 326,
              top: 624,
              zIndex: 25,
              width: 260,
              height: 260,
              borderRadius: 9999,

              background:
                "radial-gradient(circle, rgba(239,189,80,0.12) 0%, rgba(99,209,153,0.05) 38%, transparent 72%)",

              opacity: interpolate(frame, [78, 88, 123, 136], [0, 0.46, 0.3, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: [easeOut, Easing.linear, easeIn],
              }),

              scale: interpolate(frame, [82, 108, 134], [0.86, 1.08, 1.18], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
                easing: easeOut,
              }),
            }}
          />
          <Interactive.Div
            name="Single aligned active processing step"
            style={{
              position: "absolute",
              left: 468,

              top: interpolate(
                frame,
                [86, 98, 103, 112, 117, 128],
                [752, 752, 791, 791, 829, 829],
                {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [Easing.linear, easeOut, Easing.linear, easeOut, Easing.linear],
                },
              ),

              zIndex: 28,
              width: 420,
              height: 36,
              border: "2px solid rgba(239,189,80,0.58)",
              borderRadius: 8,
              backgroundColor: "rgba(239,189,80,0.045)",

              boxShadow:
                "0 0 0 1px rgba(255,247,231,0.06), 0 8px 24px rgba(239,189,80,0.08)",

              opacity: interpolate(frame, [82, 88, 124, 132], [0, 0.94, 0.74, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: [easeOut, Easing.linear, easeIn],
              }),

              translate: "-37.4px -10px"
            }} />
        </CameraUI>
      </Interactive.Div>
      <Interactive.Div
        name="Centered native proposal result crop"
        style={{
          position: "absolute",
          left: 230,
          top: 208,
          zIndex: 39,
          width: 2100,
          height: 1025,
          overflow: "hidden",
          border: "2px solid rgba(255,247,231,0.16)",
          borderRadius: 34,
          backgroundColor: "#0C1813",
          boxShadow: "0 64px 140px rgba(3,10,7,0.42)",
          opacity: interpolate(frame, [128, 138], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
        }}
      >
        <CanvasImage
          name="Real Agent completed proposal output"
          src={staticFile("captures/agent-v02-result.png")}
          width={2200}
          height={1375}
          style={{
            position: "absolute",

            left: interpolate(frame, [128, 140, 180, 212], [-472, -472, -562.5, -562.5], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut, Easing.linear],
            }),

            top: interpolate(frame, [128, 140, 180, 212], [-60, -60, -200, -200], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut, Easing.linear],
            }),

            transformOrigin: "0 0",

            scale: interpolate(frame, [128, 140, 180, 212], [1.55, 1.55, 1.25, 1.25], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: [Easing.linear, easeOut, Easing.linear],
            }),
          }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Exact continuation from accepted Agent capability ending"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 52,
          transformOrigin: "50% 100%",
          scale: interpolate(frame, [0, 16], [1, 1.035], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: easeOut,
          }),
          translate: interpolate(frame, [0, 16], ["0px 0px", "0px -28px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          }),
          opacity: interpolate(frame, [7, 17], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeIn,
          }),
          filter: `brightness(${interpolate(frame, [8, 17], [1, 0.72], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}) blur(${interpolate(frame, [9, 17], [0, 7], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeOut,
          })}px)`,
        }}
      >
        <Freeze frame={251}>
          <Segment05AgentCapabilities
            question="你能帮我干些什么？"
            bedVolume={0}
            sfxVolume={0}
          />
        </Freeze>
      </Interactive.Div>
      <Interactive.Div
        name="Processing result match-move bloom"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 70,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 12% 25%, rgba(255,247,231,0.38) 0%, rgba(99,209,153,0.13) 3.5%, rgba(239,189,80,0.06) 7%, transparent 15%)",
          opacity: interpolate(frame, [126, 132, 138, 146], [0, 0.88, 0.42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [easeOut, Easing.linear, easeIn],
          }),
          mixBlendMode: "screen",
        }}
      />
      <Interactive.Div
        name="Cinematic edge vignette"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 75,
          pointerEvents: "none",
          background:
            "radial-gradient(circle at 50% 50%, transparent 54%, rgba(3,10,7,0.12) 78%, rgba(3,10,7,0.34) 100%)",
        }}
      />
      <Audio
        name="Original segment rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
      <Sequence from={0} durationInFrames={24} layout="none">
        <Audio
          name="Input camera push"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={1.02}
          volume={sfxVolume * 0.28}
        />
      </Sequence>
      <Sequence from={18} durationInFrames={8} layout="none">
        <Audio
          name="Native input click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.61}
        />
      </Sequence>
      {formulaTickFrames.map((from, index) => (
        <Sequence
          key={`${from}-${index}`}
          from={from}
          durationInFrames={8}
          layout="none"
        >
          <Audio
            name={`Formula type tick ${index + 1}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            playbackRate={1.12 + (index % 4) * 0.05}
            volume={sfxVolume * 0.28}
          />
        </Sequence>
      ))}
      <Sequence from={68} durationInFrames={8} layout="none">
        <Audio
          name="Native formula send click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.8}
        />
      </Sequence>
      <Sequence from={70} durationInFrames={26} layout="none">
        <Audio
          name="Processing whip camera move"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={1.06}
          volume={sfxVolume * 0.36}
        />
      </Sequence>
      {[88, 102, 116].map((from, index) => (
        <Sequence key={from} from={from} durationInFrames={10} layout="none">
          <Audio
            name={`Native processing step snap ${index + 1}`}
            src={staticFile("audio/style-test/editorial-snap.wav")}
            playbackRate={0.96 + index * 0.05}
            volume={sfxVolume * 0.49}
          />
        </Sequence>
      ))}
      <Sequence from={128} durationInFrames={28} layout="none">
        <Audio
          name="Real proposal reveal move"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.9}
          volume={sfxVolume * 0.33}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
