import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import type { ReferenceStyleTestProps } from "./schema";
import { PaperGrain, StyleTestStage } from "./shared";

const sheetFields = ["原料", "供应商", "版本", "克重", "营养", "成本"];

export function Scene01FormulaQuestion({ question }: ReferenceStyleTestProps) {
  const frame = useCurrentFrame();
  const typed = question.slice(
    0,
    Math.floor(
      interpolate(frame, [10, 58], [0, question.length], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.linear,
      }),
    ),
  );

  return (
    <StyleTestStage>
      <PaperGrain />
      <Interactive.Div
        name="Workbook context"
        style={{
          position: "absolute",
          left: 150,
          top: 104,
          display: "flex",
          alignItems: "center",
          gap: 18,
          color: colors.forest,
          fontFamily: '"Manrope Promo", "Noto Sans SC Variable", sans-serif',
          fontSize: 24,
          fontWeight: 720,
          letterSpacing: 1.1,
          opacity: interpolate(frame, [0, 14], [0, 0.72], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            backgroundColor: colors.tomato,
          }}
        />
        配方研发主表 · v27.xlsx
      </Interactive.Div>

      <div
        style={{
          position: "absolute",
          inset: "240px 110px 115px",
          opacity: interpolate(frame, [0, 24, 60, 71], [0, 0.34, 0.34, 0.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          translate: interpolate(frame, [0, 71], ["0px 80px", "0px -20px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {Array.from({ length: 7 }).map((_, row) =>
          Array.from({ length: 6 }).map((__, column) => (
            <div
              key={`${row}-${column}`}
              style={{
                position: "absolute",
                left: `${column * 16.7}%`,
                top: `${row * 14.2}%`,
                width: "15.5%",
                height: "12.6%",
                border: "1px solid rgba(21,61,54,0.22)",
                borderRadius: 12,
                backgroundColor:
                  row === 0
                    ? "rgba(21,61,54,0.06)"
                    : "rgba(255,255,255,0.22)",
                color: "rgba(21,61,54,0.56)",
                padding: "18px 20px",
                fontSize: 19,
              }}
            >
              {row === 0 ? sheetFields[column] : ""}
            </div>
          )),
        )}
      </div>

      <Interactive.Div
        name="Floating formula bar"
        style={{
          position: "absolute",
          left: 310,
          top: 476,
          width: 1940,
          height: 250,
          zIndex: 20,
          borderRadius: 58,
          border: "2px solid rgba(21,61,54,0.18)",
          backgroundColor: "rgba(255,255,255,0.88)",
          boxShadow:
            "0 55px 110px rgba(21,61,54,0.16), inset 0 1px 0 rgba(255,255,255,0.95)",
          scale: interpolate(frame, [0, 18, 60, 71], [0.9, 1, 1, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.7, 0, 0.84, 0),
            ],
            output: "perceptual-scale",
          }),
          translate: interpolate(frame, [0, 18, 60, 71], ["0px 90px", "0px 0px", "0px 0px", "-110px -14px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.7, 0, 0.84, 0),
            ],
          }),
          rotate: interpolate(frame, [0, 18, 60, 71], ["-3deg", "-1deg", "-1deg", "1.2deg"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          opacity: interpolate(frame, [0, 8], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 52,
            top: 52,
            width: 112,
            height: 146,
            borderRadius: 28,
            display: "grid",
            placeItems: "center",
            backgroundColor: colors.forest,
            color: colors.cream,
            fontFamily: '"Manrope Promo", sans-serif',
            fontSize: 42,
            fontWeight: 760,
          }}
        >
          fx
        </div>
        <div
          style={{
            position: "absolute",
            left: 204,
            right: 76,
            top: 0,
            height: "100%",
            display: "flex",
            alignItems: "center",
            color: colors.forestDeep,
            fontSize: 68,
            fontWeight: 650,
            letterSpacing: -2.4,
            whiteSpace: "nowrap",
          }}
        >
          {typed}
          <span
            style={{
              width: 5,
              height: 82,
              marginLeft: 10,
              borderRadius: 999,
              backgroundColor: colors.grain,
              opacity: Math.floor(frame / 5) % 2 === 0 ? 1 : 0.22,
            }}
          />
        </div>
      </Interactive.Div>
    </StyleTestStage>
  );
}
