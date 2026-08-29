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

import { colors } from "../theme";
import type { ReferenceStyleTestProps } from "./schema";
import { PaperGrain, ReviewLabel } from "./shared";

type IngredientCameraTest02Props = ReferenceStyleTestProps & {
  unifiedBackdrop?: boolean;
};

export function IngredientCameraTest02({
  bedVolume,
  reviewLabel,
  sfxVolume,
  showReviewLabel,
  unifiedBackdrop = false,
}: IngredientCameraTest02Props) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: unifiedBackdrop ? colors.forestDeep : colors.forest,
        overflow: "hidden",
      }}
    >
      <PaperGrain dark />

      <div
        style={{
          position: "absolute",
          left: -220,
          top: -520,
          width: 1380,
          height: 1380,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(239,189,80,0.24) 0%, rgba(239,189,80,0.05) 44%, transparent 72%)",
          opacity: unifiedBackdrop ? 0 : 1,
        }}
      />

      <Interactive.Div
        name="Virtual camera position"
        style={{
          position: "absolute",
          left: 180,
          top: 88,
          width: 2200,
          height: 1375,
          zIndex: 20,
          translate: interpolate(
            frame,
            [0, 24, 72, 94, 118, 140, 142, 149],
            [
              "0px 110px",
              "0px 0px",
              "0px 0px",
              "-170px -670px",
              "-170px -670px",
              "-1980px -520px",
              "-1980px -520px",
              "-2020px -550px",
            ],
            {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [
                Easing.bezier(0.16, 1, 0.3, 1),
                Easing.linear,
                Easing.inOut(Easing.cubic),
                Easing.linear,
                Easing.inOut(Easing.cubic),
                Easing.linear,
                Easing.inOut(Easing.cubic),
              ],
            },
          ),
        }}
      >
        <Interactive.Div
          name="Virtual camera zoom"
          style={{
            position: "absolute",
            inset: 0,
            width: 2200,
            height: 1375,
            transformOrigin: "0 0",
            scale: interpolate(
              frame,
              [0, 24, 72, 94, 118, 140, 142, 149],
              [0.78, 0.96, 0.96, 1.82, 1.82, 1.68, 1.68, 1.73],
              {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                output: "perceptual-scale",
                easing: [
                  Easing.bezier(0.16, 1, 0.3, 1),
                  Easing.linear,
                  Easing.inOut(Easing.cubic),
                  Easing.linear,
                  Easing.inOut(Easing.cubic),
                  Easing.linear,
                  Easing.inOut(Easing.cubic),
                ],
              },
            ),
            opacity: interpolate(frame, [0, 10], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            filter: `blur(${interpolate(frame, [0, 15], [12, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}px)`,
          }}
        >
          <Interactive.Div
            name="Ingredient library page"
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
              name="Ingredient library interface"
              src={staticFile("captures/ingredients-nutrition.png")}
              width={2200}
              height={1375}
              style={{ position: "absolute", inset: 0 }}
            />

            <Interactive.Div
              name="Cocoa click feedback"
              style={{
                position: "absolute",
                left: 722,
                top: 676,
                width: 96,
                height: 96,
                borderRadius: 9999,
                border: `4px solid ${colors.grain}`,
                opacity: interpolate(frame, [107, 110, 118], [0, 0.62, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [Easing.inOut(Easing.cubic), Easing.inOut(Easing.cubic)],
                }),
                scale: interpolate(frame, [107, 118], [0.25, 1.35], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  output: "perceptual-scale",
                  easing: Easing.inOut(Easing.cubic),
                }),
              }}
            />

            <Interactive.Svg
              name="Supporting cursor click"
              viewBox="0 0 64 84"
              style={{
                position: "absolute",
                left: interpolate(frame, [96, 106, 113], [860, 760, 760], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.inOut(Easing.cubic),
                }),
                top: interpolate(frame, [96, 106, 113], [610, 710, 710], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: Easing.inOut(Easing.cubic),
                }),
                zIndex: 10,
                width: 44,
                height: 58,
                opacity: interpolate(frame, [95, 99, 111, 116], [0, 1, 1, 0], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  easing: [
                    Easing.inOut(Easing.cubic),
                    Easing.linear,
                    Easing.inOut(Easing.cubic),
                  ],
                }),
                scale: interpolate(frame, [107, 110, 113], [1, 0.86, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                  output: "perceptual-scale",
                  easing: [Easing.inOut(Easing.cubic), Easing.inOut(Easing.cubic)],
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

      <Audio
        name="Original camera-test rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume * 0.82}
      />
      <Sequence from={72} durationInFrames={24} layout="none">
        <Audio
          name="Camera push whoosh"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={1.06}
          volume={sfxVolume * 0.34}
        />
      </Sequence>
      <Sequence from={108} durationInFrames={8} layout="none">
        <Audio
          name="Cocoa row click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.76}
        />
      </Sequence>
      <Sequence from={118} durationInFrames={22} layout="none">
        <Audio
          name="Camera pan whoosh"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.96}
          volume={sfxVolume * 0.31}
        />
      </Sequence>

      {showReviewLabel ? (
        <ReviewLabel text={reviewLabel || "UI CAMERA TEST 02"} />
      ) : null}
    </AbsoluteFill>
  );
}
