import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import type { LaunchV02Props } from "./schema";
import {
  AgentConversationCover,
  CaptureStage,
  DemoBadge,
  LaunchBackground,
} from "./shared";

const capabilities = [
  ["整理原料资料", "从标签、规格书或表格建立待复核原料草稿"],
  ["生成配方提案", "结合原料库试算投料、营养与成本"],
  ["逆向产品标签", "给出可编辑估算并标明关键假设"],
  ["复盘研发记录", "整理事实、待确认项与下一轮打样建议"],
] as const;

export function Scene05AgentCapabilities(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const typedCharacters = Math.floor(
    interpolate(frame, [18, 58], [0, props.capabilityPrompt.length], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    }),
  );
  const customOpacity = interpolate(frame, [180, 209], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <LaunchBackground>
      <CaptureStage
        image="agent-v02-capabilities.png"
        name="Agent capabilities source capture"
      />
      <AgentConversationCover
        opacity={interpolate(frame, [180, 209], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      />
      <Interactive.Div
        name="Typed Agent capability question"
        style={{
          position: "absolute",
          zIndex: 34,
          right: 288,
          top: 205,
          minWidth: 360,
          maxWidth: 760,
          minHeight: 70,
          padding: "18px 28px",
          borderRadius: "24px 24px 8px 24px",
          opacity: customOpacity,
          backgroundColor: "#174B3D",
          color: colors.cream,
          fontSize: 34,
          fontWeight: 650,
          boxShadow: "0 18px 46px rgba(0,0,0,0.22)",
        }}
      >
        {props.capabilityPrompt.slice(0, typedCharacters)}
        {frame >= 18 && frame <= 60 ? (
          <span style={{ color: colors.grain }}>│</span>
        ) : null}
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          zIndex: 34,
          left: 630,
          top: 330,
          width: 1500,
          opacity: customOpacity,
        }}
      >
        <div
          style={{
            color: colors.cream,
            fontSize: 35,
            fontWeight: 720,
            opacity: interpolate(frame, [66, 80], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          我可以帮你：
        </div>
        <div style={{ marginTop: 24, display: "grid", gap: 14 }}>
          {capabilities.map(([title, detail], index) => (
            <Interactive.Div
              key={title}
              name={`Agent capability card ${index + 1}`}
              style={{
                display: "grid",
                gridTemplateColumns: "330px 1fr",
                alignItems: "center",
                gap: 24,
                minHeight: 98,
                padding: "0 28px",
                border: "1px solid rgba(255,247,231,0.10)",
                borderRadius: 18,
                opacity: interpolate(
                  frame,
                  [80 + index * 20, 94 + index * 20],
                  [0, 1],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
                translate: interpolate(
                  frame,
                  [80 + index * 20, 94 + index * 20],
                  ["0px 20px", "0px 0px"],
                  {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  },
                ),
                backgroundColor: "rgba(255,247,231,0.035)",
                color: colors.cream,
              }}
            >
              <strong style={{ color: index === 1 ? colors.grain : colors.cream, fontSize: 30 }}>
                {title}
              </strong>
              <span style={{ color: "rgba(255,247,231,0.62)", fontSize: 26 }}>
                {detail}
              </span>
            </Interactive.Div>
          ))}
        </div>
        <div
          style={{
            marginTop: 25,
            color: colors.grain,
            fontSize: 27,
            fontWeight: 700,
            opacity: interpolate(frame, [154, 172], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            }),
          }}
        >
          正式写入前，需要你确认。
        </div>
      </div>
      <DemoBadge text={props.demoBadge} />
    </LaunchBackground>
  );
}
