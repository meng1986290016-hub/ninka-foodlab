import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { staticFile } from "remotion";

import type { PromoProps } from "./schema";
import { sceneFrames } from "./timing";
import { AgentLandscapeScene } from "./landscape/AgentLandscapeScene";
import { CtaLandscapeScene } from "./landscape/CtaLandscapeScene";
import { IngredientsLandscapeScene } from "./landscape/IngredientsLandscapeScene";
import { IntroLandscapeScene } from "./landscape/IntroLandscapeScene";
import { LabelLandscapeScene } from "./landscape/LabelLandscapeScene";
import { WorkbenchLandscapeScene } from "./landscape/WorkbenchLandscapeScene";

export function PromoVideoLandscape(props: PromoProps) {
  return (
    <>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={75} name="Landscape brand intro">
          <IntroLandscapeScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={210} name="Landscape ingredient library">
          <IngredientsLandscapeScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={600} name="Landscape Ninka Agent">
          <AgentLandscapeScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={270} name="Landscape recipe workbench">
          <WorkbenchLandscapeScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={120} name="Landscape nutrition label">
          <LabelLandscapeScene {...props} />
        </TransitionSeries.Sequence>
        <TransitionSeries.Sequence durationInFrames={75} name="Landscape GitHub CTA">
          <CtaLandscapeScene {...props} />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      {props.musicFile ? (
        <Audio
          durationInFrames={
            sceneFrames.intro +
            sceneFrames.ingredients +
            sceneFrames.agent +
            sceneFrames.workbench +
            sceneFrames.label +
            sceneFrames.cta
          }
          src={staticFile(props.musicFile)}
          volume={props.musicVolume}
        />
      ) : null}
    </>
  );
}
