import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { LandscapeSceneShell } from "./LandscapeSceneShell";
import { LandscapeSceneTitle } from "./LandscapeText";
import { LandscapeUiFrame } from "./LandscapeUiFrame";

export function AgentLandscapeScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();

  return (
    <LandscapeSceneShell demoBadge={demoBadge}>
      <LandscapeSceneTitle
        eyebrow="02 / Ninka Agent"
        title={<>先读原料，<br />再生成待复核提案</>}
      />
      <div
        style={{
          position: "absolute",
          left: 140,
          top: 650,
          width: 630,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        {["检索供应商版本", "系统确定性试算", "生成待复核提案"].map(
          (label, index) => (
            <Interactive.Div
              key={label}
              name={`Landscape Agent step ${index + 1}`}
              style={{
                padding: "24px 28px",
                border: `1px solid ${
                  frame >= [55, 180, 350][index]!
                    ? "rgba(239,189,80,0.65)"
                    : "rgba(255,247,231,0.14)"
                }`,
                borderRadius: 20,
                backgroundColor:
                  frame >= [55, 180, 350][index]!
                    ? "rgba(239,189,80,0.12)"
                    : "rgba(255,247,231,0.04)",
                color:
                  frame >= [55, 180, 350][index]! ? colors.grain : colors.inkSoft,
                fontSize: 36,
                fontWeight: 690,
              }}
            >
              <span style={{ marginRight: 18, opacity: 0.7 }}>0{index + 1}</span>
              {label}
            </Interactive.Div>
          ),
        )}
      </div>
      <LandscapeUiFrame
        image="agent-input.png"
        name="Landscape Agent prompt capture"
        opacity={interpolate(frame, [0, 140, 168], [1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <LandscapeUiFrame
        image="agent-progress.png"
        name="Landscape Agent progress capture"
        opacity={interpolate(frame, [140, 168, 330, 360], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <LandscapeUiFrame
        image="agent-result.png"
        name="Landscape Agent proposal capture"
        opacity={interpolate(frame, [330, 360], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
    </LandscapeSceneShell>
  );
}
