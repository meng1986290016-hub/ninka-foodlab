import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import { IngredientCameraTest02 } from "../reference-style-test/IngredientCameraTest02";
import { Segment01Opening } from "../segment-01-opening/Segment01Opening";
import { Segment02ProductReveal } from "../segment-02-product-reveal/Segment02ProductReveal";
import { colors } from "../theme";
import type { CombinedFirstThreeProps } from "./schema";

export function CombinedFirstThree({
  bedVolume,
  sfxVolume,
}: CombinedFirstThreeProps) {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: colors.forestDeep, overflow: "hidden" }}>
      <Sequence name="01 · Opening question · locked" from={0} durationInFrames={105}>
        <Segment01Opening
          line1="还在使用表格"
          line2="来管理配方和原料吗？"
          bedVolume={0}
          sfxVolume={sfxVolume}
        />
      </Sequence>

      <Sequence
        name="02 · Product reveal · locked"
        from={105}
        durationInFrames={132}
        style={{
          opacity: interpolate(frame, [225, 236], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
        }}
      >
        <Segment02ProductReveal
          positioning="食品研发的本地工作台"
          bedVolume={0}
          sfxVolume={sfxVolume}
        />
      </Sequence>

      <Sequence
        name="03 · Ingredient camera · approved · redundant intro trimmed"
        from={225}
        durationInFrames={126}
        trimBefore={24}
        style={{
          opacity: interpolate(frame, [225, 236], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
        }}
      >
        <IngredientCameraTest02
          question="还在使用表格来管理配方和原料吗？"
          productLine="食品研发的本地工作台"
          ingredientName="可可粉"
          ingredientSpec="低脂可可粉 CP-10"
          reviewLabel=""
          showReviewLabel={false}
          bedVolume={0}
          sfxVolume={sfxVolume}
          unifiedBackdrop
        />
      </Sequence>

      <Interactive.Div
        name="Ingredient library explanation veil"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 44,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(5,14,10,0.9) 0%, rgba(5,14,10,0.68) 34%, rgba(5,14,10,0.18) 66%, transparent 100%)",
          opacity: interpolate(frame, [240, 250, 258, 268], [0, 0.86, 0.86, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.inOut(Easing.cubic),
              Easing.linear,
              Easing.inOut(Easing.cubic),
            ],
          }),
        }}
      />

      <Interactive.Div
        name="Independent ingredient library explanation"
        style={{
          position: "absolute",
          left: 250,
          top: 430,
          zIndex: 46,
          width: 1060,
          pointerEvents: "none",
          color: colors.cream,
          opacity: interpolate(frame, [240, 250, 258, 268], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.inOut(Easing.cubic),
              Easing.linear,
              Easing.inOut(Easing.cubic),
            ],
          }),
          translate: interpolate(frame, [240, 250], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.inOut(Easing.cubic),
          }),
        }}
      >
        <Interactive.Div
          name="Ingredient library explanation title"
          style={{
            fontSize: 104,
            fontWeight: 760,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            textShadow: "0 18px 60px rgba(3,10,7,0.34)",
          }}
        >
          独立原料库
        </Interactive.Div>
        <Interactive.Div
          name="Ingredient library explanation subtitle"
          style={{
            marginTop: 34,
            color: "rgba(255,247,231,0.76)",
            fontSize: 46,
            fontWeight: 520,
            letterSpacing: "0.03em",
            lineHeight: 1.35,
          }}
        >
          统一管理原料价格与营养成分
        </Interactive.Div>
      </Interactive.Div>

      <Audio
        name="Unified original temporary rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
    </AbsoluteFill>
  );
}
