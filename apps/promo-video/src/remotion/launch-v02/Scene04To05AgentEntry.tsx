import { Easing, interpolate, useCurrentFrame } from "remotion";

import type { LaunchV02Props } from "./schema";
import {
  AgentConversationCover,
  CaptureStage,
  CursorActor,
  DemoBadge,
  LaunchBackground,
} from "./shared";

export function Scene04To05AgentEntry(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const panelProgress = interpolate(frame, [8, 23], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <LaunchBackground>
      <CaptureStage
        image="workbench-after.png"
        name="Workbench context before opening Ninka Agent"
        opacity={interpolate(frame, [8, 23], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: panelProgress,
          scale: interpolate(frame, [8, 23], [0.08, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
            output: "perceptual-scale",
          }),
          transformOrigin: "520px 126px",
        }}
      >
        <CaptureStage
          image="agent-v02-capabilities.png"
          name="Ninka Agent panel expanding from the real entry"
        />
        <AgentConversationCover />
      </div>
      <div
        style={{
          position: "absolute",
          left: 493,
          top: 96,
          zIndex: 65,
          width: 190,
          height: 70,
          borderRadius: 18,
          border: "2px solid rgba(239,189,80,0.72)",
          opacity: interpolate(frame, [5, 9, 15], [0, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [5, 15], [0.86, 1.18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <CursorActor
        left={interpolate(frame, [0, 8], [1010, 596], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        top={interpolate(frame, [0, 8], [390, 124], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        pressed={frame >= 7 && frame <= 10}
        opacity={interpolate(frame, [13, 20], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <DemoBadge text={props.demoBadge} />
    </LaunchBackground>
  );
}
