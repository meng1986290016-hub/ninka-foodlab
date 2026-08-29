import { Audio } from "@remotion/media";
import { AbsoluteFill, Sequence, staticFile } from "remotion";

import { CombinedFirstThree } from "../combined-first-three/CombinedFirstThree";
import { Segment04WorkbenchRecalculationV02 } from "../segment-04-workbench-recalculation/Segment04WorkbenchRecalculationV02";
import { Segment05AgentCapabilities } from "../segment-05-agent-capabilities/Segment05AgentCapabilities";
import { colors } from "../theme";
import type { CombinedCurrentThroughAgentProps } from "./schema";

export function CombinedCurrentThroughAgent({
  bedVolume,
  sfxVolume,
}: CombinedCurrentThroughAgentProps) {
  return (
    <AbsoluteFill style={{ backgroundColor: colors.forestDeep, overflow: "hidden" }}>
      <Sequence
        name="01–03 · Approved opening, reveal and ingredient library"
        from={0}
        durationInFrames={351}
        premountFor={30}
      >
        <CombinedFirstThree bedVolume={0} sfxVolume={sfxVolume} />
      </Sequence>

      <Sequence
        name="04 · Approved workbench recalculation V02"
        from={351}
        durationInFrames={228}
        premountFor={30}
      >
        <Segment04WorkbenchRecalculationV02
          recalcStatement="改一处，整份配方一起复算。"
          bedVolume={0}
          sfxVolume={sfxVolume}
        />
      </Sequence>

      <Sequence
        name="05 · Approved Agent capabilities V01"
        from={579}
        durationInFrames={252}
        premountFor={30}
      >
        <Segment05AgentCapabilities
          question="你能帮我干些什么？"
          bedVolume={0}
          sfxVolume={sfxVolume}
        />
      </Sequence>

      <Audio
        name="Unified original temporary rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        loop
        loopVolumeCurveBehavior="extend"
        volume={bedVolume}
      />
    </AbsoluteFill>
  );
}

