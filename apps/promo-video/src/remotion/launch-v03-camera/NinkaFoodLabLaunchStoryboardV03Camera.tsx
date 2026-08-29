import { AbsoluteFill, Sequence } from "remotion";

import { Scene01Statement } from "../launch-v02/Scene01Statement";
import { Scene02ProductReveal } from "../launch-v02/Scene02ProductReveal";
import type { LaunchV02Props } from "../launch-v02/schema";
import { AnimaticLabel } from "../launch-v02/shared";
import { BrandBridgeMotionTest } from "../motion-test/BrandBridgeMotionTest";
import { LaunchV03Soundtrack } from "./LaunchV03Soundtrack";
import { Scene03IngredientsCamera } from "./Scene03IngredientsCamera";
import { Scene03To04CameraBridge } from "./Scene03To04CameraBridge";
import { Scene04To05AgentEntryCamera } from "./Scene04To05AgentEntryCamera";
import { Scene04WorkbenchCamera } from "./Scene04WorkbenchCamera";
import { Scene05AgentCapabilitiesCamera } from "./Scene05AgentCapabilitiesCamera";
import { Scene06AgentProposalCamera } from "./Scene06AgentProposalCamera";
import { launchV03Frames, launchV03Starts } from "./timing";

export function NinkaFoodLabLaunchStoryboardV03Camera(props: LaunchV02Props) {
  return (
    <AbsoluteFill>
      <Sequence
        from={launchV03Starts.statement}
        durationInFrames={launchV03Frames.statement}
        name="01 · Spreadsheet management problem"
      >
        <Scene01Statement {...props} />
      </Sequence>
      <Sequence
        from={launchV03Starts.productReveal}
        durationInFrames={launchV03Frames.productReveal}
        name="02 · Product reveal"
      >
        <Scene02ProductReveal {...props} />
      </Sequence>
      <Sequence
        from={launchV03Starts.ingredients}
        durationInFrames={launchV03Frames.ingredients}
        name="03 · Ingredient library continuous camera"
      >
        <Scene03IngredientsCamera />
      </Sequence>
      <Sequence
        from={launchV03Starts.ingredientToWorkbench}
        durationInFrames={launchV03Frames.ingredientToWorkbench}
        name="03→04 · Native cocoa match move"
      >
        <Scene03To04CameraBridge />
      </Sequence>
      <Sequence
        from={launchV03Starts.workbench}
        durationInFrames={launchV03Frames.workbench}
        name="04 · Recipe recalculation camera"
      >
        <Scene04WorkbenchCamera {...props} />
      </Sequence>
      <Sequence
        from={launchV03Starts.workbenchToAgent}
        durationInFrames={launchV03Frames.workbenchToAgent}
        name="04→05 · Native Agent entry camera"
      >
        <Scene04To05AgentEntryCamera />
      </Sequence>
      <Sequence
        from={launchV03Starts.agentCapabilities}
        durationInFrames={launchV03Frames.agentCapabilities}
        name="05 · Native Agent capability answer"
      >
        <Scene05AgentCapabilitiesCamera {...props} />
      </Sequence>
      <Sequence
        from={launchV03Starts.agentProposalLead}
        durationInFrames={launchV03Frames.agentProposalLead}
        name="06 · Continuous Agent proposal"
      >
        <Scene06AgentProposalCamera {...props} />
      </Sequence>
      <Sequence
        from={launchV03Starts.approvedBrandBridge}
        durationInFrames={launchV03Frames.approvedBrandBridge}
        name="07→09 · Approved brand movement"
      >
        <BrandBridgeMotionTest
          tagline={props.tagline}
          cta={props.cta}
          demoBadge={props.demoBadge}
          showReviewLabel={false}
        />
      </Sequence>
      <LaunchV03Soundtrack bedVolume={0.2} sfxVolume={0.72} />
      <AnimaticLabel visible={props.showReviewLabel} />
    </AbsoluteFill>
  );
}
