import { Audio } from "@remotion/media";
import { TransitionSeries } from "@remotion/transitions";
import { AbsoluteFill, staticFile } from "remotion";
import { CombinedCurrentThroughAgent } from "../combined-current-through-agent/CombinedCurrentThroughAgent";
import { Segment06AgentProposal } from "../segment-06-agent-proposal/Segment06AgentProposal";
import { Segment07BrandBridge } from "../segment-07-brand-bridge/Segment07BrandBridge";
import { Segment08BrandReveal } from "../segment-08-brand-reveal/Segment08BrandReveal";
import { Segment09EndCard } from "../segment-09-end-card/Segment09EndCard";
import { colors } from "../theme";
import type { FullAssemblyProps } from "./schema";

export function NinkaFoodLabFullAssemblyV01({
  bedVolume,
  sfxVolume,
}: FullAssemblyProps) {
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forestDeep,
      }}>
      <TransitionSeries>
        <TransitionSeries.Sequence
          name="01–05 · Approved opening through Agent capabilities"
          durationInFrames={831}
          premountFor={30}
        >
          <CombinedCurrentThroughAgent
            bedVolume={0}
            sfxVolume={sfxVolume}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence
          name="06 · Approved Agent formula proposal"
          durationInFrames={213}
          premountFor={30}
        >
          <Segment06AgentProposal
            formulaPrompt="请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。"
            bedVolume={0}
            sfxVolume={sfxVolume}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence
          name="07 · Approved recipe-to-brand bridge"
          durationInFrames={90}
          premountFor={30}
        >
          <Segment07BrandBridge
            formulaPrompt="请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。"
            bedVolume={0}
            sfxVolume={sfxVolume}
          />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence
          name="08 · Approved official brand reveal"
          durationInFrames={96}
          premountFor={30}
        >
          <Segment08BrandReveal bedVolume={0} sfxVolume={sfxVolume} />
        </TransitionSeries.Sequence>

        <TransitionSeries.Sequence
          name="09 · Approved GitHub end card"
          durationInFrames={108}
          premountFor={30}
        >
          <Segment09EndCard
            tagline="食品研发的本地工作台"
            repositoryPath="github.com/meng1986290016-hub/ninka-foodlab"
            bedVolume={0}
            sfxVolume={sfxVolume}
          />
        </TransitionSeries.Sequence>
      </TransitionSeries>
      <Audio
        name="MiniMax Brand Resolution · 44.6s picture-locked edit"
        src={staticFile(
          "audio/music/brand-resolution-minimax-cut-v01.wav",
        )}
        volume={bedVolume} />
    </AbsoluteFill>
  );
}
