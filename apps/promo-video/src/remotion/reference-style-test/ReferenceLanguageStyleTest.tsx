import { AbsoluteFill, Sequence } from "remotion";

import type { ReferenceStyleTestProps } from "./schema";
import { Scene01FormulaQuestion } from "./Scene01FormulaQuestion";
import { Scene02KineticStatement } from "./Scene02KineticStatement";
import { Scene03BrandReveal } from "./Scene03BrandReveal";
import { Scene04IngredientProof } from "./Scene04IngredientProof";
import { ReviewLabel } from "./shared";
import { StyleTestSoundtrack } from "./StyleTestSoundtrack";
import { STYLE_TEST_TIMING } from "./timing";

export function ReferenceLanguageStyleTest(props: ReferenceStyleTestProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: "#153D36" }}>
      <Sequence
        name="01 · Floating formula question"
        from={STYLE_TEST_TIMING.formulaQuestion.start}
        durationInFrames={STYLE_TEST_TIMING.formulaQuestion.duration}
      >
        <Scene01FormulaQuestion {...props} />
      </Sequence>
      <Sequence
        name="02 · Kinetic editorial typography"
        from={STYLE_TEST_TIMING.kineticStatement.start}
        durationInFrames={STYLE_TEST_TIMING.kineticStatement.duration}
      >
        <Scene02KineticStatement {...props} />
      </Sequence>
      <Sequence
        name="03 · Nine-module brand reveal"
        from={STYLE_TEST_TIMING.brandReveal.start}
        durationInFrames={STYLE_TEST_TIMING.brandReveal.duration}
      >
        <Scene03BrandReveal {...props} />
      </Sequence>
      <Sequence
        name="04 · 2.5D ingredient proof"
        from={STYLE_TEST_TIMING.ingredientProof.start}
        durationInFrames={STYLE_TEST_TIMING.ingredientProof.duration}
      >
        <Scene04IngredientProof {...props} />
      </Sequence>
      <StyleTestSoundtrack {...props} />
      {props.showReviewLabel ? <ReviewLabel text={props.reviewLabel} /> : null}
    </AbsoluteFill>
  );
}
