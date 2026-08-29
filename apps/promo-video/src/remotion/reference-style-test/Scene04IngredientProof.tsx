import {
  CanvasImage,
  Easing,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import type { ReferenceStyleTestProps } from "./schema";
import { PaperGrain, StyleTestStage } from "./shared";

export function Scene04IngredientProof({
  ingredientName,
  ingredientSpec,
}: ReferenceStyleTestProps) {
  const frame = useCurrentFrame();
  return (
    <StyleTestStage background={colors.forest}>
      <PaperGrain dark />
      <div
        style={{
          position: "absolute",
          left: -180,
          top: -420,
          width: 1320,
          height: 1320,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(239,189,80,0.30) 0%, rgba(239,189,80,0.06) 42%, transparent 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -220,
          bottom: -460,
          width: 1480,
          height: 1480,
          borderRadius: 9999,
          background:
            "radial-gradient(circle, rgba(223,107,69,0.20) 0%, rgba(223,107,69,0.04) 46%, transparent 72%)",
        }}
      />
      <Interactive.Div
        name="Ingredient library product card"
        style={{
          position: "absolute",
          left: 330,
          top: 176,
          width: 1900,
          height: 1188,
          zIndex: 20,
          overflow: "hidden",
          borderRadius: 44,
          border: "2px solid rgba(255,247,231,0.24)",
          backgroundColor: colors.forestDeep,
          boxShadow:
            "0 80px 170px rgba(4,12,9,0.46), 0 12px 36px rgba(239,189,80,0.12)",
          scale: interpolate(frame, [0, 24, 74, 105], [0.68, 0.94, 0.94, 1.16], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.16, 1, 0.3, 1),
            ],
            output: "perceptual-scale",
          }),
          translate: interpolate(frame, [0, 24, 74, 105], ["0px 230px", "0px 0px", "0px 0px", "250px -52px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.16, 1, 0.3, 1),
              Easing.linear,
              Easing.bezier(0.16, 1, 0.3, 1),
            ],
          }),
          rotate: interpolate(frame, [0, 24, 74, 105], ["-3deg", "-0.7deg", "-0.7deg", "0deg"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          opacity: interpolate(frame, [0, 12], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          filter: `blur(${interpolate(frame, [0, 18], [12, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px)`,
        }}
      >
        <CanvasImage
          name="Real ingredient library interface"
          src={staticFile("captures/ingredients.png")}
          width={1900}
          height={1188}
          style={{ position: "absolute", inset: 0 }}
        />
        <Interactive.Div
          name="Cocoa row focus"
          style={{
            position: "absolute",
            left: 260,
            top: 552,
            width: 410,
            height: 102,
            borderRadius: 18,
            border: `4px solid ${colors.grain}`,
            backgroundColor: "rgba(239,189,80,0.08)",
            boxShadow: "0 0 0 8px rgba(239,189,80,0.10)",

            opacity: interpolate(frame, [70, 82], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Ingredient library chapter label"
        style={{
          position: "absolute",
          left: 150,
          top: 112,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 18,
          color: colors.cream,
          fontFamily: '"Manrope Promo", "Noto Sans SC Variable", sans-serif',
          fontSize: 28,
          fontWeight: 730,
          letterSpacing: 1.6,
          opacity: interpolate(frame, [8, 24], [0, 0.82], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: 999,
            backgroundColor: colors.grain,
          }}
        />
        原料库 · 一个动作，一个证明
      </Interactive.Div>
      <Interactive.Div
        name="Floating ingredient evidence"
        style={{
          position: "absolute",
          right: 126,
          top: 250,
          zIndex: 70,
          width: 470,
          padding: "34px 38px 38px",
          borderRadius: 30,
          border: "1px solid rgba(255,247,231,0.22)",
          backgroundColor: "rgba(11,20,17,0.92)",
          boxShadow: "0 42px 90px rgba(4,12,9,0.34)",
          color: colors.cream,
          opacity: interpolate(frame, [84, 96], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [84, 100], ["130px 30px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          rotate: interpolate(frame, [84, 100], ["4deg", "1.4deg"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <div style={{ color: colors.grain, fontSize: 18, fontWeight: 760, letterSpacing: 2 }}>
          已聚焦
        </div>
        <div style={{ marginTop: 14, fontSize: 46, fontWeight: 820, letterSpacing: -2 }}>
          {ingredientName}
        </div>
        <div style={{ marginTop: 8, color: "rgba(255,247,231,0.68)", fontSize: 24, fontWeight: 620 }}>
          {ingredientSpec}
        </div>
        <div style={{ height: 1, margin: "28px 0 22px", backgroundColor: "rgba(255,247,231,0.14)" }} />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 21, color: "rgba(255,247,231,0.72)" }}>
          <span>数据完整度</span>
          <strong style={{ color: "#65D39A" }}>100%</strong>
        </div>
      </Interactive.Div>
      <svg
        aria-hidden="true"
        viewBox="0 0 64 84"
        style={{
          position: "absolute",
          left: interpolate(frame, [40, 72, 92], [410, 790, 1130], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          top: interpolate(frame, [40, 72, 92], [260, 780, 670], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          zIndex: 90,
          width: 74,
          height: 98,
          filter: "drop-shadow(0 12px 12px rgba(0,0,0,0.28))",
          opacity: interpolate(frame, [34, 42], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <path
          d="M7 4L55 49L36 53L46 76L35 81L25 58L11 72Z"
          fill={colors.cream}
          stroke={colors.forest}
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
    </StyleTestStage>
  );
}
