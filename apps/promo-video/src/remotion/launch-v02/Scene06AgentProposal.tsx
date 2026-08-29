import {
  AbsoluteFill,
  Easing,
  Freeze,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { ProposalBridgeScene } from "../motion-test/ProposalBridgeScene";
import { colors } from "../theme";
import type { LaunchV02Props } from "./schema";
import { CaptureStage, DemoBadge, LaunchBackground } from "./shared";

const stages = ["输入任务", "读取原料库", "完成确定性试算", "生成配方提案"] as const;

export function Scene06AgentProposal(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const wipeProgress = interpolate(frame, [164, 180], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const revealLeft = interpolate(wipeProgress, [0, 1], [100, 0]);
  const revealRight = interpolate(wipeProgress, [0, 1], [108, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <LaunchBackground>
        <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
          <CaptureStage
            image="agent-v02-capabilities.png"
            name="Continuous Agent conversation before second prompt"
            opacity={interpolate(frame, [0, 18], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
          <CaptureStage
            image="agent-v02-input.png"
            name="Agent formula task input state"
            opacity={interpolate(frame, [0, 18, 58, 76], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
          <CaptureStage
            image="agent-v02-progress.png"
            name="Agent deterministic processing state"
            opacity={interpolate(frame, [58, 76, 116, 136], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
          <CaptureStage
            image="agent-v02-result.png"
            name="Agent six ingredient proposal result state"
            opacity={interpolate(frame, [116, 136], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            scale={interpolate(frame, [136, 194], [1, 1.055], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            })}
          />
          <div
            style={{
              position: "absolute",
              zIndex: 45,
              left: 270,
              top: 190,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {stages.map((label, index) => (
              <Interactive.Div
                key={label}
                name={`Agent proposal phase ${index + 1}`}
                style={{
                  minWidth: 260,
                  padding: "14px 18px",
                  border: `1px solid ${
                    frame >= [12, 66, 90, 128][index]!
                      ? "rgba(239,189,80,0.54)"
                      : "rgba(255,247,231,0.12)"
                  }`,
                  borderRadius: 14,
                  backgroundColor:
                    frame >= [12, 66, 90, 128][index]!
                      ? "rgba(239,189,80,0.10)"
                      : "rgba(8,16,13,0.72)",
                  color:
                    frame >= [12, 66, 90, 128][index]!
                      ? colors.grain
                      : "rgba(255,247,231,0.48)",
                  fontSize: 24,
                  fontWeight: 680,
                }}
              >
                0{index + 1} · {label}
              </Interactive.Div>
            ))}
          </div>
          <DemoBadge text={props.demoBadge} />
        </div>
      </LaunchBackground>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 60,
          clipPath: `polygon(0 ${revealLeft}%, 100% ${revealRight}%, 100% 100%, 0 100%)`,
          backgroundColor: colors.forest,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 70,
          opacity: interpolate(frame, [180, 194], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        <Freeze frame={0}>
          <ProposalBridgeScene
            tagline={props.tagline}
            cta={props.cta}
            demoBadge={props.demoBadge}
            showReviewLabel={false}
          />
        </Freeze>
      </div>
    </AbsoluteFill>
  );
}
