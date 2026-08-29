import {
  AbsoluteFill,
  Easing,
  Freeze,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { ProposalBridgeScene } from "../motion-test/ProposalBridgeScene";
import type { LaunchV02Props } from "../launch-v02/schema";
import { colors } from "../theme";
import {
  CameraCursor,
  CameraImage,
  CameraUI,
  ClickPulse,
} from "./CameraUI";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export function Scene06AgentProposalCamera(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const points = [0, 30, 55, 98, 118, 150, 164, 194];
  const translateX = interpolate(
    frame,
    points,
    [-340, -340, -542, -542, -542, -730, -730, -780],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [Easing.linear, ease, Easing.linear, ease, ease, Easing.linear, ease],
    },
  );
  const translateY = interpolate(
    frame,
    points,
    [-760, -760, -501, -501, -606, -937, -937, -980],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [Easing.linear, ease, Easing.linear, ease, ease, Easing.linear, ease],
    },
  );
  const scale = interpolate(
    frame,
    points,
    [1.25, 1.25, 1.45, 1.45, 1.45, 1.58, 1.58, 1.63],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      output: "perceptual-scale",
      easing: [Easing.linear, ease, Easing.linear, ease, ease, Easing.linear, ease],
    },
  );
  const bridgeProgress = interpolate(frame, [164, 180], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <CameraUI
        name="Continuous Agent proposal camera"
        translateX={translateX}
        translateY={translateY}
        scale={scale}
      >
        <CameraImage
          image="agent-v02-input.png"
          name="Formula prompt in the same conversation"
          opacity={interpolate(frame, [39, 40], [1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <CameraImage
          image="agent-v02-progress.png"
          name="Agent reading ingredient library and calculating"
          opacity={interpolate(frame, [39, 40, 106, 107], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <CameraImage
          image="agent-v02-result.png"
          name="Native editable recipe proposal"
          opacity={interpolate(frame, [106, 107], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <ClickPulse
          left={2048}
          top={1260}
          opacity={interpolate(frame, [20, 23, 32], [0, 0.58, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          scale={interpolate(frame, [20, 32], [0.2, 1.3], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: ease,
          })}
        />
        <CameraCursor
          left={interpolate(frame, [5, 21], [1800, 2095], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          top={interpolate(frame, [5, 21], [1180, 1300], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          opacity={interpolate(frame, [4, 7, 27, 36], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          pressed={frame >= 21 && frame <= 25}
        />
      </CameraUI>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 80,
          clipPath: `polygon(0 ${100 - bridgeProgress * 100}%, 100% ${108 - bridgeProgress * 108}%, 100% 100%, 0 100%)`,
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
