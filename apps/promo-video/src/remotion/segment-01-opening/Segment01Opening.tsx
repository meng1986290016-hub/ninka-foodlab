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

import { colors } from "../theme";
import type { Segment01OpeningProps } from "./schema";

const headers = ["原料", "供应商", "版本", "用量", "损耗", "营养", "成本"];
const TYPING_START_FRAME = 14;
const FRAMES_PER_CHARACTER = 4;

const clamp = {
  extrapolateLeft: "clamp" as const,
  extrapolateRight: "clamp" as const,
};

function TextLine({
  accent,
  start,
  text,
}: {
  accent: string[];
  start: number;
  text: string;
}) {
  const frame = useCurrentFrame();
  const count = Math.floor(
    interpolate(
      frame,
      [start, start + text.length * FRAMES_PER_CHARACTER],
      [0, text.length],
      clamp,
    ),
  );
  const visible = text.slice(0, count);

  return (
    <div style={{ minHeight: 126, whiteSpace: "nowrap" }}>
      {Array.from(visible).map((character, index) => {
        const isAccent = accent.includes(character);
        return (
          <span
            key={`${character}-${index}`}
            style={{
              color: isAccent ? colors.tomato : colors.forestDeep,
              display: "inline-block",
            }}
          >
            {character}
          </span>
        );
      })}
    </div>
  );
}

export function Segment01Opening({
  bedVolume,
  line1,
  line2,
  sfxVolume,
}: Segment01OpeningProps) {
  const frame = useCurrentFrame();
  const totalCharacters = line1.length + line2.length;
  const typedCharacters = Math.floor(
    interpolate(
      frame,
      [
        TYPING_START_FRAME,
        TYPING_START_FRAME + totalCharacters * FRAMES_PER_CHARACTER,
      ],
      [0, totalCharacters],
      clamp,
    ),
  );
  const tickFrames = Array.from(
    { length: totalCharacters },
    (_, index) =>
      TYPING_START_FRAME + (index + 1) * FRAMES_PER_CHARACTER,
  );
  const typingFinished = typedCharacters >= totalCharacters;

  const cameraScale = interpolate(frame, [0, 16, 84, 104], [0.95, 1, 1.018, 1.055], {
    ...clamp,
    easing: [
      Easing.bezier(0.16, 1, 0.3, 1),
      Easing.linear,
      Easing.bezier(0.7, 0, 0.84, 0),
    ],
    output: "perceptual-scale",
  });
  const cameraY = interpolate(frame, [0, 16, 84, 104], [74, 0, -10, -36], {
    ...clamp,
    easing: [
      Easing.bezier(0.16, 1, 0.3, 1),
      Easing.linear,
      Easing.bezier(0.7, 0, 0.84, 0),
    ],
  });
  const exitOpacity = interpolate(frame, [96, 104], [1, 0], {
    ...clamp,
    easing: Easing.bezier(0.7, 0, 0.84, 0),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.cream,
        color: colors.forestDeep,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
        overflow: "hidden",
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 17% 18%, rgba(239,189,80,0.20), transparent 33%), radial-gradient(circle at 82% 76%, rgba(223,107,69,0.12), transparent 36%)",
          opacity: 0.78,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(21,61,54,0.11) 0 1px, transparent 1.5px)",
          backgroundSize: "58px 58px",
          opacity: 0.26,
        }}
      />

      <Interactive.Div
        name="Opening virtual camera"
        style={{
          position: "absolute",
          inset: 0,
          opacity: exitOpacity,
          scale: cameraScale,
          translate: `0px ${cameraY}px`,
          transformOrigin: "50% 50%",
        }}
      >
        <Interactive.Div
          name="Recipe spreadsheet context"
          style={{
            position: "absolute",
            left: 150,
            top: 150,
            width: 2260,
            height: 1110,
            overflow: "hidden",
            border: "2px solid rgba(21,61,54,0.15)",
            borderRadius: 48,
            backgroundColor: "rgba(255,255,255,0.34)",
            boxShadow: "0 48px 130px rgba(21,61,54,0.08)",
            rotate: interpolate(frame, [0, 18], ["-1.25deg", "-0.45deg"], {
              ...clamp,
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gridTemplateRows: "108px repeat(5, 1fr)",
            }}
          >
            {Array.from({ length: 42 }).map((_, index) => {
              const column = index % 7;
              const row = Math.floor(index / 7);
              return (
                <div
                  key={index}
                  style={{
                    borderBottom: "1px solid rgba(21,61,54,0.12)",
                    borderRight: "1px solid rgba(21,61,54,0.12)",
                    color: "rgba(21,61,54,0.40)",
                    display: "flex",
                    alignItems: "center",
                    padding: "0 30px",
                    fontSize: 24,
                    fontWeight: 620,
                    letterSpacing: 0.5,
                  }}
                >
                  {row === 0 ? headers[column] : ""}
                </div>
              );
            })}
          </div>
        </Interactive.Div>

        <Interactive.Div
          name="Question formula surface"
          style={{
            position: "absolute",
            left: 270,
            top: 356,
            width: 2020,
            height: 622,
            zIndex: 10,
            overflow: "hidden",
            border: "2px solid rgba(21,61,54,0.16)",
            borderRadius: 64,
            backgroundColor: "rgba(255,255,255,0.94)",
            boxShadow:
              "0 64px 140px rgba(21,61,54,0.17), inset 0 1px 0 rgba(255,255,255,0.98)",
            opacity: interpolate(frame, [0, 7], [0, 1], {
              ...clamp,
              easing: Easing.out(Easing.quad),
            }),
            scale: interpolate(frame, [0, 16, 84, 104], [0.91, 1, 1, 1.025], {
              ...clamp,
              easing: [
                Easing.bezier(0.16, 1, 0.3, 1),
                Easing.linear,
                Easing.bezier(0.7, 0, 0.84, 0),
              ],
              output: "perceptual-scale",
            }),
            translate: interpolate(frame, [0, 16, 84, 104], ["0px 92px", "0px 0px", "0px 0px", "0px -16px"], {
              ...clamp,
              easing: [
                Easing.bezier(0.16, 1, 0.3, 1),
                Easing.linear,
                Easing.bezier(0.7, 0, 0.84, 0),
              ],
            }),
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: 244,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 24,
              borderRight: "1px solid rgba(21,61,54,0.13)",
              backgroundColor: "rgba(21,61,54,0.035)",
            }}
          >
            <div
              style={{
                width: 118,
                height: 118,
                borderRadius: 34,
                display: "grid",
                placeItems: "center",
                backgroundColor: colors.forest,
                color: colors.cream,
                fontFamily: '"Manrope Promo", sans-serif',
                fontSize: 44,
                fontWeight: 760,
                boxShadow: "0 18px 36px rgba(21,61,54,0.16)",
              }}
            >
              fx
            </div>
            <div
              style={{
                color: "rgba(21,61,54,0.48)",
                fontFamily: '"Manrope Promo", "Noto Sans SC Variable", sans-serif',
                fontSize: 19,
                fontWeight: 720,
                letterSpacing: 2.2,
              }}
            >
              FORMULA
            </div>
          </div>

          <Interactive.Div
            name="Opening question text"
            style={{
              position: "absolute",
              left: 328,
              right: 104,
              top: 104,
              fontSize: 98,
              fontWeight: 720,
              letterSpacing: -4.2,
              lineHeight: 1.28,
            }}
          >
            <TextLine
              accent={["表", "格"]}
              start={TYPING_START_FRAME}
              text={line1}
            />
            <TextLine
              accent={["配", "方", "原", "料"]}
              start={
                TYPING_START_FRAME +
                line1.length * FRAMES_PER_CHARACTER
              }
              text={line2}
            />
            <span
              style={{
                position: "absolute",
                left: typedCharacters < line1.length ? typedCharacters * 94 : Math.min(line2.length, typedCharacters - line1.length) * 94,
                top: typedCharacters < line1.length ? 8 : 134,
                width: 6,
                height: 102,
                borderRadius: 999,
                backgroundColor: colors.grain,
                opacity: typingFinished ? interpolate(frame, [78, 86], [1, 0], clamp) : Math.floor(frame / 5) % 2 === 0 ? 1 : 0.3,
              }}
            />
          </Interactive.Div>

          <div
            style={{
              position: "absolute",
              left: 328,
              bottom: 62,
              width: interpolate(frame, [78, 91], [0, 1460], {
                ...clamp,
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              height: 4,
              borderRadius: 999,
              background: `linear-gradient(90deg, ${colors.grain}, ${colors.tomato})`,
              opacity: interpolate(frame, [76, 82], [0, 0.9], clamp),
            }}
          />
        </Interactive.Div>
      </Interactive.Div>

      <Audio
        name="Original opening rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
      <Sequence from={0} durationInFrames={25} layout="none">
        <Audio
          name="Opening surface whoosh"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.96}
          volume={sfxVolume * 0.28}
        />
      </Sequence>
      {tickFrames.map((tickFrame) => (
        <Sequence key={tickFrame} from={tickFrame} durationInFrames={8} layout="none">
          <Audio
            name={`Typing tick ${tickFrame}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            playbackRate={1.08}
            volume={sfxVolume * 0.48}
          />
        </Sequence>
      ))}
      <Sequence from={78} durationInFrames={20} layout="none">
        <Audio
          name="Question resolve accent"
          src={staticFile("audio/style-test/editorial-snap.wav")}
          volume={sfxVolume * 0.5}
        />
      </Sequence>
    </AbsoluteFill>
  );
}
