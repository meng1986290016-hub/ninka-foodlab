import {
  AbsoluteFill,
  Img,
  Interactive,
  staticFile,
} from "remotion";

import type { PromoProps } from "./schema";
import { colors } from "./theme";

export function Cover(_: PromoProps) {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forestDeep,
        color: colors.cream,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(circle at 12% 8%, rgba(21,61,54,0.95), transparent 46%), radial-gradient(circle at 92% 92%, rgba(239,189,80,0.18), transparent 42%)",
        }}
      />
      <Img
        name="Ninka FoodLab symbol"
        src={staticFile("brand/ninka-symbol-color-dark.svg")}
        style={{ position: "absolute", top: 100, left: 90, width: 150, height: 150 }}
      />
      <Interactive.Div
        name="Cover brand"
        style={{
          position: "absolute",
          top: 320,
          left: 90,
          right: 90,
          color: colors.cream,
          fontFamily: '"Manrope Promo", sans-serif',
          fontSize: 92,
          fontWeight: 790,
          letterSpacing: -3,
        }}
      >
        Ninka FoodLab
      </Interactive.Div>
      <Interactive.Div
        name="Cover title"
        style={{
          position: "absolute",
          top: 475,
          left: 90,
          right: 90,
          color: colors.cream,
          fontSize: 100,
          fontWeight: 790,
          lineHeight: 1.16,
          letterSpacing: -4,
        }}
      >
        食品研发人的
        <br />
        工作台
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          top: 780,
          left: 92,
          width: 190,
          height: 8,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${colors.tomato}, ${colors.grain})`,
        }}
      />
      <Interactive.Div
        name="Fresh product capture"
        style={{
          position: "absolute",
          left: 82,
          top: 890,
          width: 1078,
          height: 674,
          overflow: "hidden",
          rotate: "-2deg",
          border: "1px solid rgba(255,247,231,0.2)",
          borderRadius: 32,
          boxShadow: "0 38px 100px rgba(0,0,0,0.5)",
          backgroundColor: "#101714",
        }}
      >
        <Img
          src={staticFile("captures/agent-result.png")}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </Interactive.Div>
      <Interactive.Div
        name="Cover feature line"
        style={{
          position: "absolute",
          left: 90,
          bottom: 55,
          padding: "16px 24px",
          borderRadius: 999,
          backgroundColor: "rgba(239,189,80,0.13)",
          color: colors.grain,
          fontSize: 28,
          fontWeight: 720,
          letterSpacing: 3,
        }}
      >
        开源 · 离线优先 · AI 协作
      </Interactive.Div>
    </AbsoluteFill>
  );
}
