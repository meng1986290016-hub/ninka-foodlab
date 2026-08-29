import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import type { PromoProps } from "../schema";
import { colors } from "../theme";
import { BottomCaption, SceneTitle } from "../components/SceneTitle";
import { SceneShell } from "../components/SceneShell";
import { UiFrame } from "../components/UiFrame";

export function WorkbenchScene({ demoBadge }: PromoProps) {
  const frame = useCurrentFrame();
  return (
    <SceneShell demoBadge={demoBadge}>
      <Interactive.Div
        name="Human confirmation boundary"
        style={{
          position: "absolute",
          zIndex: 10,
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 100px",
          opacity: interpolate(frame, [0, 8, 38, 56], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          backgroundColor: colors.forestDeep,
          color: colors.cream,
          fontSize: 64,
          fontWeight: 760,
          lineHeight: 1.35,
          textAlign: "center",
        }}
      >
        人工确认后
        <br />
        才进入配方工作台
      </Interactive.Div>
      <div
        style={{
          opacity: interpolate(frame, [48, 68], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <SceneTitle eyebrow="03 / Recipe Workbench" title="一次调整，结果同步更新" />
        <UiFrame
          image="workbench-before.png"
          name="Workbench before adjustment"
          opacity={interpolate(frame, [60, 152, 174], [1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <UiFrame
          image="workbench-after.png"
          name="Workbench after adjustment"
          opacity={interpolate(frame, [152, 174], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <Interactive.Div
          name="Cocoa amount change"
          style={{
            position: "absolute",
            top: 1088,
            left: 80,
            right: 80,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 22,
            opacity: interpolate(frame, [118, 150], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
            color: colors.grain,
            fontFamily: '"Manrope Promo", sans-serif',
            fontSize: 42,
            fontWeight: 780,
          }}
        >
          <span>可可粉</span>
          <span style={{ color: colors.cream }}>28 g</span>
          <span>→</span>
          <span style={{ color: colors.cream }}>32 g</span>
        </Interactive.Div>
        <BottomCaption>每次调整，都能重新计算</BottomCaption>
      </div>
    </SceneShell>
  );
}
