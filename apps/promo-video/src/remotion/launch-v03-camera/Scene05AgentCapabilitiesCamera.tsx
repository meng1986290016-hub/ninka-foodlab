import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import type { LaunchV02Props } from "../launch-v02/schema";
import { colors } from "../theme";
import {
  CameraCursor,
  CameraImage,
  CameraUI,
  ClickPulse,
} from "./CameraUI";

const ease = Easing.bezier(0.16, 1, 0.3, 1);

export function Scene05AgentCapabilitiesCamera(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const points = [0, 22, 30, 72, 96, 120, 155, 209];
  const translateX = interpolate(
    frame,
    points,
    [0, 0, -620, -620, -320, -76, -76, -340],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [ease, ease, Easing.linear, ease, ease, Easing.linear, ease],
    },
  );
  const translateY = interpolate(
    frame,
    points,
    [20, 0, -924, -924, -460, -34, -34, -760],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [ease, ease, Easing.linear, ease, ease, Easing.linear, ease],
    },
  );
  const scale = interpolate(
    frame,
    points,
    [0.88, 0.94, 1.36, 1.36, 1.43, 1.5, 1.5, 1.25],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      output: "perceptual-scale",
      easing: [ease, ease, Easing.linear, ease, ease, Easing.linear, ease],
    },
  );
  const typedCharacters = Math.floor(
    interpolate(frame, [35, 63], [0, props.capabilityPrompt.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const sourceOpacity = interpolate(frame, [82, 83], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ overflow: "hidden", backgroundColor: colors.forest }}>
      <CameraUI
        name="Agent capability conversation camera"
        translateX={translateX}
        translateY={translateY}
        scale={scale}
      >
        <CameraImage
          image="agent-input.png"
          name="Agent blank conversation before question"
          opacity={sourceOpacity}
        />
        <CameraImage
          image="agent-v02-capabilities.png"
          name="Native Agent capability answer"
          opacity={interpolate(frame, [82, 83], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
        />
        <Interactive.Div
          name="Native input content reset"
          style={{
            position: "absolute",
            left: 400,
            top: 1160,
            zIndex: 16,
            width: 1680,
            height: 92,
            padding: "18px 12px",
            opacity: sourceOpacity,
            backgroundColor: "#0C1813",
            color: colors.cream,
            fontSize: 23,
            fontWeight: 590,
          }}
        >
          {frame < 33 ? (
            <span style={{ color: "rgba(255,247,231,0.48)" }}>输入消息…</span>
          ) : (
            <>
              {props.capabilityPrompt.slice(0, typedCharacters)}
              {frame <= 66 ? <span style={{ color: colors.grain }}>│</span> : null}
            </>
          )}
        </Interactive.Div>
        <ClickPulse
          left={2048}
          top={1260}
          opacity={interpolate(frame, [66, 69, 78], [0, 0.58, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          scale={interpolate(frame, [66, 78], [0.2, 1.3], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: ease,
          })}
        />
        <CameraCursor
          left={interpolate(frame, [20, 29, 60, 68], [1250, 900, 900, 2095], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [ease, Easing.linear, ease],
          })}
          top={interpolate(frame, [20, 29, 60, 68], [1040, 1205, 1205, 1300], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [ease, Easing.linear, ease],
          })}
          opacity={interpolate(frame, [18, 22, 72, 82], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}
          pressed={(frame >= 28 && frame <= 32) || (frame >= 68 && frame <= 72)}
        />
      </CameraUI>
    </AbsoluteFill>
  );
}
