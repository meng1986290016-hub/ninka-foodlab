import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { SceneTitle } from "../components/SceneTitle";
import { SceneShell } from "../components/SceneShell";
import { UiFrame } from "../components/UiFrame";

export function AgentScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();
  return (
    <SceneShell demoBadge={demoBadge}>
      <SceneTitle eyebrow="02 / Ninka Agent" title="先读原料，再生成待复核提案" />
      <UiFrame
        image="agent-input.png"
        name="Agent prompt capture"
        opacity={interpolate(frame, [0, 140, 168], [1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <UiFrame
        image="agent-progress.png"
        name="Agent progress capture"
        opacity={interpolate(frame, [140, 168, 330, 360], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <UiFrame
        image="agent-result.png"
        name="Agent proposal capture"
        opacity={interpolate(frame, [330, 360], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <div
        style={{
          position: "absolute",
          left: 80,
          right: 80,
          bottom: 142,
          display: "flex",
          gap: 18,
        }}
      >
        {["检索供应商版本", "系统确定性试算", "生成待复核提案"].map(
          (label, index) => (
            <Interactive.Div
              key={label}
              name={`Agent step ${index + 1}`}
              style={{
                flex: 1,
                padding: "18px 14px",
                border: `1px solid ${
                  frame >= [55, 180, 350][index]! ? "rgba(239,189,80,0.62)" : "rgba(255,247,231,0.14)"
                }`,
                borderRadius: 18,
                backgroundColor:
                  frame >= [55, 180, 350][index]!
                    ? "rgba(239,189,80,0.12)"
                    : "rgba(255,247,231,0.04)",
                color:
                  frame >= [55, 180, 350][index]! ? colors.grain : colors.inkSoft,
                fontSize: 24,
                fontWeight: 680,
                textAlign: "center",
              }}
            >
              {label}
            </Interactive.Div>
          ),
        )}
      </div>
    </SceneShell>
  );
}
