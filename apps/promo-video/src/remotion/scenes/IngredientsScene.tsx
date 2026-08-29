import { Easing, interpolate, useCurrentFrame } from "remotion";

import type { PromoProps } from "../schema";
import { BottomCaption, SceneTitle } from "../components/SceneTitle";
import { SceneShell } from "../components/SceneShell";
import { UiFrame } from "../components/UiFrame";

export function IngredientsScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();
  return (
    <SceneShell demoBadge={demoBadge}>
      <SceneTitle eyebrow="01 / Ingredient Library" title="每一种原料，都有具体版本" />
      <UiFrame
        image="ingredients.png"
        name="Latest ingredient library capture"
        opacity={interpolate(frame, [0, 78, 96], [1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <UiFrame
        image="ingredients-nutrition.png"
        name="Latest ingredient nutrition capture"
        opacity={interpolate(frame, [78, 96], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <BottomCaption>供应商 · 规格 · 营养 · 成本</BottomCaption>
    </SceneShell>
  );
}
