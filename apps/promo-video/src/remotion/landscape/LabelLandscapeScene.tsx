import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { LandscapeSceneShell } from "./LandscapeSceneShell";
import { LandscapeSceneTitle } from "./LandscapeText";
import { LandscapeUiFrame } from "./LandscapeUiFrame";

export function LabelLandscapeScene({ demoBadge }: PromoProps) {
  return (
    <LandscapeSceneShell demoBadge={demoBadge}>
      <LandscapeSceneTitle
        eyebrow="04 / Nutrition Label"
        title={<>从研发试算，<br />到营养标签预览</>}
      />
      <LandscapeUiFrame image="label.png" name="Landscape latest nutrition label capture" />
      <div
        style={{
          position: "absolute",
          left: 140,
          bottom: 154,
          width: 630,
          padding: "28px 30px",
          border: "1px solid rgba(239,189,80,0.4)",
          borderRadius: 22,
          backgroundColor: "rgba(11,20,17,0.8)",
          color: colors.inkSoft,
          fontSize: 32,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        演示结果不替代正式标签合规审核
      </div>
    </LandscapeSceneShell>
  );
}
