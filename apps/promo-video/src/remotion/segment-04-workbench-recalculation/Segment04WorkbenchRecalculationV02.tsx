import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { PaperGrain } from "../reference-style-test/shared";
import { colors } from "../theme";
import type { Segment04WorkbenchRecalculationProps } from "./schema";

const COCOA_AMOUNT_DIGIT_FRAMES = [133, 141] as const;

export function Segment04WorkbenchRecalculationV02({
  bedVolume,
  recalcStatement,
  sfxVolume,
}: Segment04WorkbenchRecalculationProps) {
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
        name="Approved ingredient-library ending"
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [14, 31], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.84, 0),
          }),
          filter: `blur(${interpolate(frame, [12, 31], [0, 14], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.84, 0),
          })}px) brightness(${interpolate(frame, [11, 31], [1, 0.52], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })})`,
        }}
      >
        <Interactive.Div
          name="Locked ingredient camera position"
          style={{
            position: "absolute",
            left: 180,
            top: 88,
            width: 2200,
            height: 1375,
            translate: interpolate(
              frame,
              [0, 10, 30],
              ["-2020px -550px", "-2020px -550px", "-1180px -260px"],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: [Easing.linear, Easing.bezier(0.16, 1, 0.3, 1)],
              },
            ),
          }}
        >
          <Interactive.Div
            name="Locked ingredient camera zoom"
            style={{
              position: "absolute",
              inset: 0,
              width: 2200,
              height: 1375,
              transformOrigin: "0 0",
              scale: interpolate(frame, [0, 10, 30], [1.73, 1.73, 1.28], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
                easing: [Easing.linear, Easing.bezier(0.16, 1, 0.3, 1)],
              }),
            }}
          >
            <Interactive.Div
              name="Locked ingredient-library page"
              style={{
                position: "absolute",
                inset: 0,
                width: 2200,
                height: 1375,
                overflow: "hidden",
                borderRadius: 42,
                border: "2px solid rgba(255,247,231,0.22)",
                backgroundColor: colors.forestDeep,
                boxShadow: "0 68px 150px rgba(4,12,9,0.48)",
              }}
            >
              <CanvasImage
                name="Ingredient library source frame"
                src={staticFile("captures/ingredients-nutrition.png")}
                width={2200}
                height={1375}
                style={{ position: "absolute", inset: 0 }}
              />
            </Interactive.Div>
          </Interactive.Div>
        </Interactive.Div>
      </Interactive.Div>

      <Interactive.Div
        name="Workbench virtual camera position"
        style={{
          position: "absolute",
          left: 180,
          top: 88,
          width: 2200,
          height: 1375,
          zIndex: 24,
          translate: interpolate(
            frame,
            [14, 32, 90, 114, 152, 174, 198, 227],
            [
              "74px 52px",
              "0px 0px",
              "0px 0px",
              "-370px -803px",
              "-370px -803px",
              "-145px -70px",
              "-1510px -390px",
              "-1460px -350px",
            ],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [
                Easing.bezier(0.16, 1, 0.3, 1),
                Easing.linear,
                Easing.bezier(0.42, 0, 0.58, 1),
                Easing.linear,
                Easing.bezier(0.42, 0, 0.58, 1),
                Easing.bezier(0.42, 0, 0.58, 1),
                Easing.bezier(0.42, 0, 0.58, 1),
              ],
            },
          ),
        }}
      >
        <Interactive.Div
          name="Workbench virtual camera zoom"
          style={{
            position: "absolute",
            inset: 0,
            width: 2200,
            height: 1375,
            transformOrigin: "0 0",
            scale: interpolate(
              frame,
              [14, 32, 90, 114, 152, 174, 198, 227],
              [0.9, 1, 1, 1.75, 1.75, 1.58, 1.62, 1.59],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
                easing: [
                  Easing.bezier(0.16, 1, 0.3, 1),
                  Easing.linear,
                  Easing.bezier(0.42, 0, 0.58, 1),
                  Easing.linear,
                  Easing.bezier(0.42, 0, 0.58, 1),
                  Easing.bezier(0.42, 0, 0.58, 1),
                  Easing.bezier(0.42, 0, 0.58, 1),
                ],
              },
            ),
            opacity: interpolate(frame, [14, 31], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            filter: `blur(${interpolate(frame, [14, 31], [12, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}px)`,
          }}
        >
          <Interactive.Div
            name="Recipe workbench page"
            style={{
              position: "absolute",
              inset: 0,
              width: 2200,
              height: 1375,
              overflow: "hidden",
              borderRadius: 42,
              border: "2px solid rgba(255,247,231,0.22)",
              backgroundColor: colors.forestDeep,
              boxShadow: "0 68px 150px rgba(4,12,9,0.48)",
            }}
          >
            <CanvasImage
              name="Workbench before cocoa adjustment"
              src={staticFile("captures/workbench-before.png")}
              width={2200}
              height={1375}
              style={{ position: "absolute", inset: 0 }}
            />

            <CanvasImage
              name="Cocoa amount recalculated region"
              src={staticFile("captures/workbench-after.png")}
              width={2200}
              height={1375}
              style={{
                position: "absolute",
                inset: 0,
                clipPath: "inset(790px 1180px 505px 770px round 18px)",
                opacity: interpolate(frame, [146, 151], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />
            <CanvasImage
              name="Input total and yield recalculated region"
              src={staticFile("captures/workbench-after.png")}
              width={2200}
              height={1375}
              style={{
                position: "absolute",
                inset: 0,
                clipPath: "inset(310px 610px 850px 270px round 24px)",
                opacity: interpolate(frame, [172, 179], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />
            <CanvasImage
              name="Nutrition recalculated region"
              src={staticFile("captures/workbench-after.png")}
              width={2200}
              height={1375}
              style={{
                position: "absolute",
                inset: 0,
                clipPath: "inset(345px 18px 455px 1658px round 22px)",
                opacity: interpolate(frame, [194, 201], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />
            <CanvasImage
              name="Cost recalculated region"
              src={staticFile("captures/workbench-after.png")}
              width={2200}
              height={1375}
              style={{
                position: "absolute",
                inset: 0,
                clipPath: "inset(860px 18px 105px 1658px round 22px)",
                opacity: interpolate(frame, [204, 211], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />
            <CanvasImage
              name="Workbench settled recalculation state"
              src={staticFile("captures/workbench-after.png")}
              width={2200}
              height={1375}
              style={{
                position: "absolute",
                inset: 0,
                opacity: interpolate(frame, [212, 220], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />

            <Interactive.Div
              name="Cocoa input typing surface"
              style={{
                position: "absolute",
                left: 788,
                top: 803,
                zIndex: 30,
                width: 204,
                height: 58,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                paddingRight: 18,
                borderRadius: 13,
                border: "2px solid rgba(239,189,80,0.78)",
                backgroundColor: "#0D1713",
                color: colors.cream,
                fontSize: 27,
                fontWeight: 760,
                opacity: interpolate(frame, [128, 133, 147, 152], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                boxShadow: "0 0 0 8px rgba(239,189,80,0.06)",
              }}
            >
              {frame < COCOA_AMOUNT_DIGIT_FRAMES[0]
                ? ""
                : frame < COCOA_AMOUNT_DIGIT_FRAMES[1]
                  ? "3"
                  : "32"}
            </Interactive.Div>

            <Interactive.Div
              name="Input total recalculation glow"
              style={{
                position: "absolute",
                left: 282,
                top: 324,
                zIndex: 22,
                width: 1320,
                height: 190,
                borderRadius: 30,
                opacity: interpolate(frame, [168, 176, 184, 191], [0, 0.31, 0.2, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [
                    Easing.bezier(0.16, 1, 0.3, 1),
                    Easing.linear,
                    Easing.bezier(0.7, 0, 0.84, 0),
                  ],
                }),
                background:
                  "radial-gradient(ellipse at 42% 50%, rgba(99,209,153,0.26), transparent 68%)",
                boxShadow: "inset 0 0 0 2px rgba(99,209,153,0.26)",
              }}
            />

            <Interactive.Div
              name="Nutrition cascade glow"
              style={{
                position: "absolute",
                left: 1658,
                top: 345,
                zIndex: 22,
                width: 524,
                height: 575,
                borderRadius: 24,
                opacity: interpolate(frame, [190, 199, 207, 215], [0, 0.28, 0.18, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [
                    Easing.bezier(0.16, 1, 0.3, 1),
                    Easing.linear,
                    Easing.bezier(0.7, 0, 0.84, 0),
                  ],
                }),
                background:
                  "linear-gradient(180deg, rgba(239,189,80,0.16), rgba(239,189,80,0.02))",
                boxShadow: "inset 0 0 0 2px rgba(239,189,80,0.18)",
              }}
            />

            <Interactive.Div
              name="Cost cascade glow"
              style={{
                position: "absolute",
                left: 1658,
                top: 860,
                zIndex: 22,
                width: 524,
                height: 410,
                borderRadius: 24,
                opacity: interpolate(frame, [200, 209, 217, 225], [0, 0.28, 0.18, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [
                    Easing.bezier(0.16, 1, 0.3, 1),
                    Easing.linear,
                    Easing.bezier(0.7, 0, 0.84, 0),
                  ],
                }),
                background:
                  "linear-gradient(180deg, rgba(99,209,153,0.15), rgba(99,209,153,0.02))",
                boxShadow: "inset 0 0 0 2px rgba(99,209,153,0.18)",
              }}
            />

            <Interactive.Div
              name="Native cocoa click feedback"
              style={{
                position: "absolute",
                left: 840,
                top: 773,
                zIndex: 34,
                width: 108,
                height: 108,
                borderRadius: 9999,
                border: `4px solid ${colors.grain}`,
                opacity: interpolate(frame, [125, 129, 139], [0, 0.58, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [Easing.linear, Easing.bezier(0.16, 1, 0.3, 1)],
                }),
                scale: interpolate(frame, [125, 139], [0.25, 1.3], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  output: "perceptual-scale",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
              }}
            />

            <Interactive.Svg
              name="Workbench cursor"
              viewBox="0 0 64 84"
              style={{
                position: "absolute",
                left: interpolate(frame, [114, 125, 138], [1110, 920, 920], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                top: interpolate(frame, [114, 125, 138], [700, 824, 824], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                zIndex: 40,
                width: 44,
                height: 58,
                opacity: interpolate(frame, [112, 116, 147, 153], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                scale: interpolate(frame, [125, 129, 133], [1, 0.86, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  output: "perceptual-scale",
                  easing: [
                    Easing.bezier(0.16, 1, 0.3, 1),
                    Easing.bezier(0.16, 1, 0.3, 1),
                  ],
                }),
                filter: "drop-shadow(0 8px 8px rgba(0,0,0,0.30))",
              }}
            >
              <path
                d="M7 4L55 49L36 53L46 76L35 81L25 58L11 72Z"
                fill={colors.cream}
                stroke={colors.forest}
                strokeWidth="3"
                strokeLinejoin="round"
              />
            </Interactive.Svg>
          </Interactive.Div>
        </Interactive.Div>
      </Interactive.Div>

      <Interactive.Div
        name="Recipe workbench explanation veil"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 64,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(5,14,10,0.9) 0%, rgba(5,14,10,0.68) 34%, rgba(5,14,10,0.18) 66%, transparent 100%)",
          opacity: interpolate(frame, [34, 44, 58, 68], [0, 0.86, 0.86, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.42, 0, 0.58, 1),
              Easing.linear,
              Easing.bezier(0.42, 0, 0.58, 1),
            ],
          }),
        }}
      />

      <Interactive.Div
        name="Recipe workbench explanation"
        style={{
          position: "absolute",
          left: 250,
          top: 430,
          zIndex: 72,
          width: 1160,
          pointerEvents: "none",
          color: colors.cream,
          opacity: interpolate(frame, [34, 44, 58, 68], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.42, 0, 0.58, 1),
              Easing.linear,
              Easing.bezier(0.42, 0, 0.58, 1),
            ],
          }),
          translate: interpolate(frame, [34, 44], ["0px 28px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.42, 0, 0.58, 1),
          }),
        }}
      >
        <Interactive.Div
          name="Recipe workbench explanation title"
          style={{
            fontSize: 104,
            fontWeight: 760,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            textShadow: "0 18px 60px rgba(3,10,7,0.34)",
          }}
        >
          配方工作台
        </Interactive.Div>
        <Interactive.Div
          name="Recipe workbench explanation subtitle"
          style={{
            marginTop: 34,
            color: "rgba(255,247,231,0.76)",
            fontSize: 46,
            fontWeight: 520,
            letterSpacing: "0.03em",
            lineHeight: 1.35,
          }}
        >
          配方、营养与成本同步复算
        </Interactive.Div>
      </Interactive.Div>

      <Interactive.Div
        name="Workbench cocoa-row landing highlight"
        style={{
          position: "absolute",
          left: 463,
          top: 852,
          zIndex: 68,
          width: 1340,
          height: 92,
          borderRadius: 16,
          border: "2px solid rgba(239,189,80,0.36)",
          opacity: interpolate(frame, [70, 76, 82, 88], [0, 0.72, 0.42, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.42, 0, 0.58, 1),
              Easing.linear,
              Easing.bezier(0.42, 0, 0.58, 1),
            ],
          }),
          boxShadow: "0 0 48px rgba(239,189,80,0.10)",
        }}
      />

      <Interactive.Div
        name="Recalculation statement backdrop"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 75,
          height: 265,
          opacity: interpolate(frame, [207, 215, 222, 227], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.7, 0, 0.84, 0),
            ],
          }),
          background:
            "linear-gradient(180deg, transparent 0%, rgba(7,13,11,0.66) 54%, rgba(7,13,11,0.94) 100%)",
        }}
      />

      <Interactive.Div
        name="Recalculation statement"
        style={{
          position: "absolute",
          left: 120,
          right: 120,
          bottom: 72,
          zIndex: 80,
          color: colors.cream,
          textAlign: "center",
          fontSize: 58,
          fontWeight: 720,
          letterSpacing: "0.01em",
          opacity: interpolate(frame, [209, 216, 222, 227], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.7, 0, 0.84, 0),
            ],
          }),
          translate: interpolate(frame, [209, 216], ["0px 26px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          textShadow: "0 12px 38px rgba(0,0,0,0.72)",
        }}
      >
        {recalcStatement}
      </Interactive.Div>

      <Audio
        name="Original segment rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
      <Sequence from={8} durationInFrames={24} layout="none">
        <Audio
          name="Native ingredient-row match whoosh"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.88}
          volume={sfxVolume * 0.34}
        />
      </Sequence>
      <Sequence from={90} durationInFrames={24} layout="none">
        <Audio
          name="Workbench overview camera push"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={1.02}
          volume={sfxVolume * 0.26}
        />
      </Sequence>
      <Sequence from={125} durationInFrames={8} layout="none">
        <Audio
          name="Cocoa input click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.78}
        />
      </Sequence>
      {COCOA_AMOUNT_DIGIT_FRAMES.map((from, index) => (
        <Sequence key={from} from={from} durationInFrames={8} layout="none">
          <Audio
            name={`Cocoa amount type tick ${index + 1}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            playbackRate={0.98 + index * 0.04}
            volume={sfxVolume * 0.56}
          />
        </Sequence>
      ))}
      {[173, 197, 207].map((from, index) => (
        <Sequence key={from} from={from} durationInFrames={10} layout="none">
          <Audio
            name={`Recalculation cascade tick ${index + 1}`}
            src={staticFile("audio/style-test/editorial-snap.wav")}
            playbackRate={0.94 + index * 0.07}
            volume={sfxVolume * (0.54 + index * 0.065)}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
