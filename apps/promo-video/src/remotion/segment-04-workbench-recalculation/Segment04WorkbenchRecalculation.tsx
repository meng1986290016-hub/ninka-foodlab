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

export function Segment04WorkbenchRecalculation({
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
          opacity: interpolate(frame, [8, 23], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.84, 0),
          }),
          filter: `blur(${interpolate(frame, [8, 23], [0, 14], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.84, 0),
          })}px) brightness(${interpolate(frame, [7, 23], [1, 0.52], {
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
            translate: "-2020px -550px",
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
              scale: 1.73,
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
            [8, 24, 76, 102, 116, 142, 191],
            [
              "-430px -850px",
              "-370px -803px",
              "-370px -803px",
              "-145px -70px",
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
                Easing.bezier(0.16, 1, 0.3, 1),
                Easing.linear,
                Easing.bezier(0.16, 1, 0.3, 1),
                Easing.bezier(0.16, 1, 0.3, 1),
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
              [8, 24, 76, 102, 116, 142, 191],
              [1.94, 1.75, 1.75, 1.58, 1.58, 1.62, 1.59],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
                easing: [
                  Easing.bezier(0.16, 1, 0.3, 1),
                  Easing.linear,
                  Easing.bezier(0.16, 1, 0.3, 1),
                  Easing.linear,
                  Easing.bezier(0.16, 1, 0.3, 1),
                  Easing.bezier(0.16, 1, 0.3, 1),
                ],
              },
            ),
            opacity: interpolate(frame, [8, 23], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            filter: `blur(${interpolate(frame, [8, 23], [12, 0], {
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
                opacity: interpolate(frame, [72, 77], [0, 1], {
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
                opacity: interpolate(frame, [90, 97], [0, 1], {
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
                opacity: interpolate(frame, [126, 133], [0, 1], {
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
                opacity: interpolate(frame, [144, 151], [0, 1], {
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
                opacity: interpolate(frame, [153, 162], [0, 1], {
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
                opacity: interpolate(frame, [55, 60, 76, 81], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                boxShadow: "0 0 0 8px rgba(239,189,80,0.06)",
              }}
            >
              {frame < 67 ? "3" : "32"}
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
                opacity: interpolate(frame, [87, 94, 104, 112], [0, 0.34, 0.24, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [
                    Easing.bezier(0.16, 1, 0.3, 1),
                    Easing.linear,
                    Easing.bezier(0.7, 0, 0.84, 0),
                  ],
                }),
                background:
                  "radial-gradient(ellipse at 42% 50%, rgba(99,209,153,0.30), transparent 68%)",
                boxShadow: "inset 0 0 0 2px rgba(99,209,153,0.30)",
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
                opacity: interpolate(frame, [122, 131, 139, 147], [0, 0.3, 0.2, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [
                    Easing.bezier(0.16, 1, 0.3, 1),
                    Easing.linear,
                    Easing.bezier(0.7, 0, 0.84, 0),
                  ],
                }),
                background:
                  "linear-gradient(180deg, rgba(239,189,80,0.20), rgba(239,189,80,0.03))",
                boxShadow: "inset 0 0 0 2px rgba(239,189,80,0.22)",
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
                opacity: interpolate(frame, [140, 149, 158, 166], [0, 0.3, 0.2, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [
                    Easing.bezier(0.16, 1, 0.3, 1),
                    Easing.linear,
                    Easing.bezier(0.7, 0, 0.84, 0),
                  ],
                }),
                background:
                  "linear-gradient(180deg, rgba(99,209,153,0.18), rgba(99,209,153,0.02))",
                boxShadow: "inset 0 0 0 2px rgba(99,209,153,0.22)",
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
                opacity: interpolate(frame, [50, 54, 64], [0, 0.58, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [Easing.linear, Easing.bezier(0.16, 1, 0.3, 1)],
                }),
                scale: interpolate(frame, [50, 64], [0.25, 1.3], {
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
                left: interpolate(frame, [34, 50, 62], [1110, 920, 920], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                top: interpolate(frame, [34, 50, 62], [700, 824, 824], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.bezier(0.16, 1, 0.3, 1),
                }),
                zIndex: 40,
                width: 44,
                height: 58,
                opacity: interpolate(frame, [32, 38, 73, 80], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                scale: interpolate(frame, [50, 54, 58], [1, 0.86, 1], {
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
        name="Cocoa ingredient match-move card"
        style={{
          position: "absolute",
          left: interpolate(frame, [1, 6, 22, 28], [-110, -70, 520, 520], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.linear,
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
            ],
          }),
          top: interpolate(frame, [1, 6, 22, 28], [470, 470, 630, 630], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.linear,
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
            ],
          }),
          zIndex: 70,
          width: interpolate(frame, [1, 6, 22], [1020, 1020, 1540], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          height: interpolate(frame, [1, 6, 22], [132, 132, 142], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          overflow: "hidden",
          borderRadius: 24,
          border: "2px solid rgba(239,189,80,0.50)",
          backgroundColor: "rgba(11,20,17,0.96)",
          boxShadow: "0 30px 90px rgba(3,9,7,0.50)",
          opacity: interpolate(frame, [1, 4, 22, 29], [0, 1, 1, 0], {
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
        <Interactive.Div
          name="Supplier fields leaving match move"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 44px",
            opacity: interpolate(frame, [6, 14], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.7, 0, 0.84, 0),
            }),
          }}
        >
          <span style={{ fontSize: 34, fontWeight: 760 }}>低脂可可粉 CP-10</span>
          <span style={{ color: colors.inkSoft, fontSize: 29 }}>¥48.00/kg</span>
        </Interactive.Div>

        <Interactive.Div
          name="Recipe fields entering match move"
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 44px",
            opacity: interpolate(frame, [11, 19], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <span style={{ fontSize: 38, fontWeight: 760 }}>可可粉</span>
          <span style={{ color: colors.inkSoft, fontSize: 31 }}>低脂可可粉 CP-10</span>
          <span style={{ color: colors.grain, fontSize: 38, fontWeight: 780 }}>28 g</span>
          <span style={{ color: colors.inkSoft, fontSize: 31 }}>2.80%</span>
        </Interactive.Div>
      </Interactive.Div>

      <Interactive.Div
        name="Recalculation statement backdrop"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 75,
          height: 265,
          opacity: interpolate(frame, [148, 160, 184, 191], [0, 1, 1, 0], {
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
          opacity: interpolate(frame, [151, 162, 184, 191], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.7, 0, 0.84, 0),
            ],
          }),
          translate: interpolate(frame, [151, 162], ["0px 26px", "0px 0px"], {
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
      <Sequence from={5} durationInFrames={24} layout="none">
        <Audio
          name="Ingredient to workbench whoosh"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.94}
          volume={sfxVolume * 0.62}
        />
      </Sequence>
      <Sequence from={52} durationInFrames={8} layout="none">
        <Audio
          name="Cocoa input click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.72}
        />
      </Sequence>
      {[61, 66, 70].map((from, index) => (
        <Sequence key={from} from={from} durationInFrames={8} layout="none">
          <Audio
            name={`Cocoa amount type tick ${index + 1}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            playbackRate={0.98 + index * 0.04}
            volume={sfxVolume * 0.5}
          />
        </Sequence>
      ))}
      {[91, 128, 146].map((from, index) => (
        <Sequence key={from} from={from} durationInFrames={10} layout="none">
          <Audio
            name={`Recalculation cascade tick ${index + 1}`}
            src={staticFile("audio/style-test/editorial-snap.wav")}
            playbackRate={0.94 + index * 0.07}
            volume={sfxVolume * (0.5 + index * 0.06)}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
