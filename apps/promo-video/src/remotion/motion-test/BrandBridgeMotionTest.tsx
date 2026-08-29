import { AbsoluteFill, Sequence } from "remotion";

import { BrandCrescendoScene } from "./BrandCrescendoScene";
import { EndCardScene } from "./EndCardScene";
import { ProposalBridgeScene } from "./ProposalBridgeScene";
import type { MotionTestProps } from "./schema";
import {
  motionTestFrames,
  proposalBridgeDuration,
} from "./timing";

export function BrandBridgeMotionTest(props: MotionTestProps) {
  return (
    <AbsoluteFill>
      <Sequence durationInFrames={69} name="Scene 06 ending and Scene 07 brand bridge">
        <ProposalBridgeScene {...props} />
      </Sequence>
      <Sequence
        from={proposalBridgeDuration}
        durationInFrames={96}
        name="Scene 08 brand crescendo"
      >
        <BrandCrescendoScene {...props} />
      </Sequence>
      <Sequence
        from={proposalBridgeDuration + motionTestFrames.brandCrescendo}
        durationInFrames={102}
        name="Scene 09 end card"
      >
        <EndCardScene {...props} />
      </Sequence>
    </AbsoluteFill>
  );
}

