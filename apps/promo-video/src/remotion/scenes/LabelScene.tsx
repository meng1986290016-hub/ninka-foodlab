import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { SceneTitle } from "../components/SceneTitle";
import { SceneShell } from "../components/SceneShell";
import { UiFrame } from "../components/UiFrame";

export function LabelScene({ demoBadge }: PromoProps) {
  return (
    <SceneShell demoBadge={demoBadge}>
      <SceneTitle eyebrow="04 / Nutrition Label" title="从研发试算，到营养标签预览" />
      <UiFrame image="label.png" name="Latest nutrition label capture" />
      <div
        style={{
          position: "absolute",
          left: 100,
          right: 100,
          bottom: 174,
          padding: "22px 28px",
          border: "1px solid rgba(239,189,80,0.36)",
          borderRadius: 18,
          backgroundColor: "rgba(11,20,17,0.76)",
          color: colors.inkSoft,
          fontSize: 30,
          lineHeight: 1.5,
          textAlign: "center",
        }}
      >
        演示结果不替代正式标签合规审核
      </div>
    </SceneShell>
  );
}
