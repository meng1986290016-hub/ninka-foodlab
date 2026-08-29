import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { LandscapeSceneShell } from "./LandscapeSceneShell";
import { LandscapeCaption, LandscapeSceneTitle } from "./LandscapeText";
import { LandscapeUiFrame } from "./LandscapeUiFrame";

export function WorkbenchLandscapeScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();

  return (
    <LandscapeSceneShell demoBadge={demoBadge}>
      <Interactive.Div
        name="Landscape human confirmation boundary"
        style={{
          position: "absolute",
          zIndex: 10,
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: interpolate(frame, [0, 8, 38, 56], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          backgroundColor: colors.forestDeep,
          color: colors.cream,
          fontSize: 112,
          fontWeight: 770,
          lineHeight: 1.32,
          textAlign: "center",
        }}
      >
        人工确认后，才进入配方工作台
      </Interactive.Div>
      <div
        style={{
          opacity: interpolate(frame, [48, 68], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <LandscapeSceneTitle
          eyebrow="03 / Recipe Workbench"
          title={<>一次调整，<br />结果同步更新</>}
        />
        <LandscapeUiFrame
          image="workbench-before.png"
          name="Landscape workbench before adjustment"
          opacity={interpolate(frame, [60, 152, 174], [1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <LandscapeUiFrame
          image="workbench-after.png"
          name="Landscape workbench after adjustment"
          opacity={interpolate(frame, [152, 174], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <Interactive.Div
          name="Landscape cocoa amount change"
          style={{
            position: "absolute",
            top: 700,
            left: 140,
            width: 630,
            padding: "34px 36px",
            border: "1px solid rgba(239,189,80,0.42)",
            borderRadius: 24,
            opacity: interpolate(frame, [118, 150], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            backgroundColor: "rgba(239,189,80,0.08)",
            color: colors.grain,
            fontFamily: '"Manrope Promo", sans-serif',
            fontSize: 54,
            fontWeight: 780,
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 12, fontSize: 30, color: colors.inkSoft }}>可可粉用量</div>
          <span style={{ color: colors.cream }}>28 g</span>
          <span style={{ margin: "0 24px" }}>→</span>
          <span style={{ color: colors.cream }}>32 g</span>
        </Interactive.Div>
        <LandscapeCaption>每次调整，都能重新计算</LandscapeCaption>
      </div>
    </LandscapeSceneShell>
  );
}
