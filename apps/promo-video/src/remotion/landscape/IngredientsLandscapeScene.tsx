import { Easing, Interactive, interpolate, useCurrentFrame } from "remotion";

import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { LandscapeSceneShell } from "./LandscapeSceneShell";
import { LandscapeCaption, LandscapeSceneTitle } from "./LandscapeText";
import { LandscapeUiFrame } from "./LandscapeUiFrame";

export function IngredientsLandscapeScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();

  return (
    <LandscapeSceneShell demoBadge={demoBadge}>
      <LandscapeSceneTitle
        eyebrow="01 / Ingredient Library"
        title={<>每一种原料，<br />都有具体版本</>}
      />
      <div
        style={{
          position: "absolute",
          top: 650,
          left: 140,
          width: 630,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 18,
        }}
      >
        {["供应商", "规格", "营养", "成本"].map((label, index) => (
          <Interactive.Div
            key={label}
            name={`Landscape ingredient feature ${index + 1}`}
            style={{
              padding: "24px 18px",
              border: "1px solid rgba(239,189,80,0.34)",
              borderRadius: 20,
              backgroundColor: "rgba(239,189,80,0.07)",
              opacity: interpolate(frame, [20 + index * 6, 38 + index * 6], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              color: index === 2 ? colors.grain : colors.cream,
              fontSize: 40,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {label}
          </Interactive.Div>
        ))}
      </div>
      <LandscapeUiFrame
        image="ingredients.png"
        name="Landscape latest ingredient library capture"
        opacity={interpolate(frame, [0, 78, 96], [1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <LandscapeUiFrame
        image="ingredients-nutrition.png"
        name="Landscape latest ingredient nutrition capture"
        opacity={interpolate(frame, [78, 96], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <LandscapeCaption>供应商 · 规格 · 营养 · 成本</LandscapeCaption>
    </LandscapeSceneShell>
  );
}
