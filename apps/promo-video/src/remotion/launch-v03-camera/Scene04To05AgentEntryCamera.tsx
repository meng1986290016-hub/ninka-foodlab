import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import {
  CameraCursor,
  CameraImage,
  CameraUI,
  ClickPulse,
} from "./CameraUI";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export function Scene04To05AgentEntryCamera() {
  const frame = useCurrentFrame();
  const portal = interpolate(frame, [12, 23], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <CameraUI
        name="Workbench camera returning to Agent entry"
        translateX={interpolate(frame, [0, 12], [-1460, -42], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        translateY={interpolate(frame, [0, 12], [-250, 120], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: ease,
        })}
        scale={interpolate(frame, [0, 12], [1.52, 1.85], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          output: "perceptual-scale",
          easing: ease,
        })}
        blur={interpolate(frame, [2, 7, 12], [0, 7, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: [ease, ease],
        })}
      >
        <CameraImage image="workbench-after.png" name="Native Ninka Agent entry" />
        <ClickPulse
          left={344}
          top={10}
          opacity={interpolate(frame, [12, 15, 22], [0, 0.62, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          scale={interpolate(frame, [12, 22], [0.2, 1.3], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: ease,
          })}
        />
        <CameraCursor
          left={interpolate(frame, [5, 13], [520, 390], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          top={interpolate(frame, [5, 13], [160, 48], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: ease,
          })}
          opacity={interpolate(frame, [4, 7, 17, 22], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          pressed={frame >= 13 && frame <= 17}
        />
      </CameraUI>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 60,
          clipPath: `circle(${portal * 155}% at 31% 13%)`,
          backgroundColor: colors.forest,
        }}
      >
        <CameraUI
          name="Agent workspace opening from native entry"
          translateX={0}
          translateY={0}
          scale={interpolate(frame, [12, 23], [0.9, 0.94], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: ease,
          })}
        >
          <CameraImage image="agent-input.png" name="Agent new conversation workspace" />
          <Interactive.Div
            name="Agent input cleared during entry transition"
            style={{
              position: "absolute",
              left: 400,
              top: 1160,
              zIndex: 16,
              width: 1680,
              height: 92,
              padding: "18px 12px",
              backgroundColor: "#0C1813",
              color: "rgba(255,247,231,0.48)",
              fontSize: 23,
              fontWeight: 590,
            }}
          >
            输入消息…
          </Interactive.Div>
        </CameraUI>
      </div>
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 70,
          backgroundColor: colors.cream,
          opacity: interpolate(frame, [12, 15, 20], [0, 0.1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      />
    </AbsoluteFill>
  );
}
