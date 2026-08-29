import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { staticFile } from "remotion";

import type { PromoProps } from "./schema";
import { sceneFrames } from "./timing";
import { AgentScene } from "./scenes/AgentScene";
import { CtaScene } from "./scenes/CtaScene";
import { IngredientsScene } from "./scenes/IngredientsScene";
import { IntroScene } from "./scenes/IntroScene";
import { LabelScene } from "./scenes/LabelScene";
import { WorkbenchScene } from "./scenes/WorkbenchScene";

export function PromoVideo(props: PromoProps) {
  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={75} name="Brand intro">
          <IntroScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={210} name="Ingredient library">
          <IngredientsScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={600} name="Ninka Agent">
          <AgentScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={270} name="Recipe workbench">
          <WorkbenchScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={120} name="Nutrition label">
          <LabelScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={75} name="GitHub CTA">
          <CtaScene {...props} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {props.musicFile ? (
        <Audio
          durationInFrames={sceneFrames.intro + sceneFrames.ingredients + sceneFrames.agent + sceneFrames.workbench + sceneFrames.label + sceneFrames.cta}
          src={staticFile(props.musicFile)}
          volume={props.musicVolume}
        />
      ) : null}
    </>
  );
}
