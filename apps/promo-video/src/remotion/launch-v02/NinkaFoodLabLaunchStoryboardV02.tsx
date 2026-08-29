import { AbsoluteFill, Sequence } from "remotion";

import { BrandBridgeMotionTest } from "../motion-test/BrandBridgeMotionTest";
import { Scene01Statement } from "./Scene01Statement";
import { Scene02ProductReveal } from "./Scene02ProductReveal";
import { Scene03Ingredients } from "./Scene03Ingredients";
import { Scene03To04MatchMove } from "./Scene03To04MatchMove";
import { Scene04To05AgentEntry } from "./Scene04To05AgentEntry";
import { Scene04Workbench } from "./Scene04Workbench";
import { Scene05AgentCapabilities } from "./Scene05AgentCapabilities";
import { Scene06AgentProposal } from "./Scene06AgentProposal";
import type { LaunchV02Props } from "./schema";
import { AnimaticLabel } from "./shared";
import { launchV02Frames, launchV02Starts } from "./timing";

export function NinkaFoodLabLaunchStoryboardV02(props: LaunchV02Props) {
  return (
    <AbsoluteFill>
      <Sequence
        from={launchV02Starts.statement}
        durationInFrames={launchV02Frames.statement}
        name="01 · Spreadsheet management problem"
      >
        <Scene01Statement {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.productReveal}
        durationInFrames={launchV02Frames.productReveal}
        name="02 · Product reveal"
      >
        <Scene02ProductReveal {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.ingredients}
        durationInFrames={launchV02Frames.ingredients}
        name="03 · Ingredient library"
      >
        <Scene03Ingredients {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.ingredientToWorkbench}
        durationInFrames={launchV02Frames.ingredientToWorkbench}
        name="03→04 · Cocoa row match move"
      >
        <Scene03To04MatchMove {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.workbench}
        durationInFrames={launchV02Frames.workbench}
        name="04 · Deterministic recipe recalculation"
      >
        <Scene04Workbench {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.workbenchToAgent}
        durationInFrames={launchV02Frames.workbenchToAgent}
        name="04→05 · Open Ninka Agent from the real entry"
      >
        <Scene04To05AgentEntry {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.agentCapabilities}
        durationInFrames={launchV02Frames.agentCapabilities}
        name="05 · Agent capability answer"
      >
        <Scene05AgentCapabilities {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.agentProposalLead}
        durationInFrames={launchV02Frames.agentProposalLead}
        name="06 · Continue the conversation and generate a proposal"
      >
        <Scene06AgentProposal {...props} />
      </Sequence>
      <Sequence
        from={launchV02Starts.approvedBrandBridge}
        durationInFrames={launchV02Frames.approvedBrandBridge}
        name="06 ending → 07 → 08 → 09 · Approved brand movement"
      >
        <BrandBridgeMotionTest
          tagline={props.tagline}
          cta={props.cta}
          demoBadge={props.demoBadge}
          showReviewLabel={false}
        />
      </Sequence>
      <AnimaticLabel visible={props.showReviewLabel} />
    </AbsoluteFill>
  );
}
