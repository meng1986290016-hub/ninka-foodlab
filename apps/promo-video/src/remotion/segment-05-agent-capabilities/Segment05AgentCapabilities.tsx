import { Audio } from "@remotion/media";
import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

import {
  CameraCursor,
  CameraImage,
  CameraUI,
  ClickPulse,
} from "../launch-v03-camera/CameraUI";
import { PaperGrain } from "../reference-style-test/shared";
import { colors } from "../theme";
import { getCharacterRevealFrames } from "../typing-timing";
import type { Segment05AgentCapabilitiesProps } from "./schema";

const easeOut = Easing.bezier(0.16, 1, 0.3, 1);
const easeIn = Easing.bezier(0.7, 0, 0.84, 0);
const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
const QUESTION_TYPING_START_FRAME = 136;
const QUESTION_TYPING_END_FRAME = 154;

const capabilities = [
  {
    title: "整理原料资料",
    detail: "从标签、规格书或表格建立待复核原料草稿",
  },
  {
    title: "生成配方提案",
    detail: "结合原料库试算投料、营养、成本与数据完整度",
    featured: true,
  },
  {
    title: "逆向产品标签",
    detail: "从配料表与营养标签建立可编辑估算",
  },
  {
    title: "复盘研发记录",
    detail: "整理已记录事实、待确认项与下一轮打样建议",
  },
] as const;

function CapabilityRow({
  detail,
  featured,
  index,
  title,
}: {
  detail: string;
  featured?: boolean;
  index: number;
  title: string;
}) {
  const frame = useCurrentFrame();
  const start = 183 + index * 11;
  const enter = interpolate(frame, [start, start + 9], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  const emphasis = featured
    ? interpolate(frame, [194, 204, 234, 249], [0, 1, 1, 0.72], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: [easeOut, Easing.linear, easeIn],
      })
    : 0;

  return (
    <Interactive.Div
      name={`Agent capability ${index + 1}: ${title}`}
      style={{
        position: "absolute",
        left: 478,
        top: 356 + index * 92,
        zIndex: 25,
        width: 1328,
        height: 78,
        display: "flex",
        alignItems: "center",
        gap: 24,
        padding: "0 30px 0 24px",
        borderRadius: 19,
        border: featured
          ? `2px solid rgba(239,189,80,${0.2 + emphasis * 0.52})`
          : "2px solid rgba(255,247,231,0.11)",
        background: featured
          ? `linear-gradient(90deg, rgba(239,189,80,${0.055 + emphasis * 0.065}), rgba(21,42,33,0.72))`
          : "linear-gradient(90deg, rgba(27,48,39,0.82), rgba(18,34,28,0.72))",
        boxShadow: featured
          ? `0 0 ${24 + emphasis * 30}px rgba(239,189,80,${emphasis * 0.12})`
          : "0 16px 34px rgba(0,0,0,0.09)",
        opacity: enter,
        translate: `${(1 - enter) * 28}px 0px`,
      }}
    >
      <Interactive.Div
        name={`${title} index`}
        style={{
          width: 38,
          height: 38,
          flex: "0 0 auto",
          display: "grid",
          placeItems: "center",
          borderRadius: 12,
          backgroundColor: featured
            ? `rgba(239,189,80,${0.16 + emphasis * 0.16})`
            : "rgba(99,209,153,0.12)",
          color: featured ? colors.grain : "#63D199",
          fontSize: 18,
          fontWeight: 820,
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </Interactive.Div>
      <div
        style={{
          width: 258,
          flex: "0 0 auto",
          color: colors.cream,
          fontSize: 25,
          fontWeight: 760,
          letterSpacing: "0.01em",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "rgba(255,247,231,0.67)",
          fontSize: 21,
          fontWeight: 560,
        }}
      >
        {detail}
      </div>
    </Interactive.Div>
  );
}

export function Segment05AgentCapabilities({
  bedVolume,
  question,
  sfxVolume,
}: Segment05AgentCapabilitiesProps) {
  const frame = useCurrentFrame();
  const agentOpen = interpolate(frame, [45, 63], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeInOut,
  });
  const typedCharacters = Math.floor(
    interpolate(
      frame,
      [QUESTION_TYPING_START_FRAME, QUESTION_TYPING_END_FRAME],
      [0, question.length],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    ),
  );
  const questionTickFrames = getCharacterRevealFrames({
    characterCount: question.length,
    endFrame: QUESTION_TYPING_END_FRAME,
    startFrame: QUESTION_TYPING_START_FRAME,
  });
  const afterSend = interpolate(frame, [159, 166], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });

  const agentCameraX = interpolate(
    frame,
    [112, 128, 160, 180, 226, 251],
    [0, -90, -90, -590, -590, -120],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [easeInOut, Easing.linear, easeInOut, Easing.linear, easeInOut],
    },
  );
  const agentCameraY = interpolate(
    frame,
    [112, 128, 160, 180, 226, 251],
    [0, -430, -430, -110, -110, -230],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: [easeInOut, Easing.linear, easeInOut, Easing.linear, easeInOut],
    },
  );
  const agentCameraScale = interpolate(
    frame,
    [112, 128, 160, 180, 226, 251],
    [1, 1.22, 1.22, 1.28, 1.28, 1.16],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      output: "perceptual-scale",
      easing: [easeInOut, Easing.linear, easeInOut, Easing.linear, easeInOut],
    },
  );

  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forestDeep,
        color: colors.cream,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <PaperGrain dark />

      <Interactive.Div
        name="Workbench context before Agent"
        style={{
          position: "absolute",
          inset: 0,
          opacity: interpolate(frame, [46, 64], [1, 0.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeInOut,
          }),
          filter: `brightness(${interpolate(frame, [44, 64], [1, 0.48], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeInOut,
          })}) blur(${interpolate(frame, [46, 64], [0, 10], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeInOut,
          })}px)`,
        }}
      >
        <CameraUI
          name="Workbench returning from recalculation results"
          translateX={interpolate(frame, [0, 36], [-1460, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeInOut,
          })}
          translateY={interpolate(frame, [0, 36], [-350, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: easeInOut,
          })}
          scale={interpolate(frame, [0, 36], [1.59, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            output: "perceptual-scale",
            easing: easeInOut,
          })}
        >
          <CameraImage
            image="workbench-after.png"
            name="Settled recalculated workbench"
          />
          <ClickPulse
            left={340}
            top={5}
            opacity={interpolate(frame, [41, 44, 52], [0, 0.62, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut],
            })}
            scale={interpolate(frame, [41, 52], [0.2, 1.34], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: easeOut,
            })}
          />
          <CameraCursor
            left={interpolate(frame, [12, 40], [1810, 390], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeInOut,
            })}
            top={interpolate(frame, [12, 40], [618, 50], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: easeInOut,
            })}
            opacity={interpolate(frame, [8, 13, 45, 52], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            pressed={frame >= 42 && frame <= 45}
          />
        </CameraUI>
      </Interactive.Div>

      <Interactive.Div
        name="Agent workspace unfolding from native entry"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 50,
          clipPath: `circle(${8 + agentOpen * 142}% at 22% 9.5%)`,
          opacity: interpolate(frame, [45, 51], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <CameraUI
          name="Agent conversation continuous camera"
          translateX={agentCameraX}
          translateY={agentCameraY}
          scale={agentCameraScale}
        >
          <CameraImage
            image="agent-input.png"
            name="Native Agent new conversation"
            opacity={1 - afterSend}
          />
          <CameraImage
            image="agent-v02-capabilities.png"
            name="Native Agent capability conversation"
            opacity={afterSend}
          />

          <Interactive.Div
            name="Question typing surface"
            style={{
              position: "absolute",
              left: 390,
              top: 1160,
              zIndex: 18,
              width: 1680,
              height: 92,
              padding: "18px 16px",
              backgroundColor: "#0C1813",
              color: colors.cream,
              fontSize: 24,
              fontWeight: 610,
              opacity: 1 - afterSend,
            }}
          >
            {frame < 132 ? (
              <span style={{ color: "rgba(255,247,231,0.42)" }}>输入消息…</span>
            ) : (
              <>
                {question.slice(0, typedCharacters)}
                {frame <= 157 ? <span style={{ color: "#63D199" }}>│</span> : null}
              </>
            )}
          </Interactive.Div>

          <ClickPulse
            left={2048}
            top={1260}
            opacity={interpolate(frame, [156, 160, 169], [0, 0.62, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [Easing.linear, easeOut],
            })}
            scale={interpolate(frame, [156, 169], [0.2, 1.32], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              output: "perceptual-scale",
              easing: easeOut,
            })}
          />
          <CameraCursor
            left={interpolate(frame, [120, 130, 150, 158], [1240, 900, 900, 2094], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [easeInOut, Easing.linear, easeInOut],
            })}
            top={interpolate(frame, [120, 130, 150, 158], [1040, 1202, 1202, 1304], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: [easeInOut, Easing.linear, easeInOut],
            })}
            opacity={interpolate(frame, [118, 123, 161, 170], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
            pressed={(frame >= 128 && frame <= 132) || (frame >= 157 && frame <= 161)}
          />

          <Interactive.Div
            name="Capability source text cleanup"
            style={{
              position: "absolute",
              left: 454,
              top: 282,
              zIndex: 20,
              width: 1505,
              height: 505,
              backgroundColor: "#0C1712",
              opacity: afterSend,
            }}
          />

          <Interactive.Div
            name="Agent thinking status"
            style={{
              position: "absolute",
              left: 478,
              top: 304,
              zIndex: 24,
              display: "flex",
              alignItems: "center",
              gap: 16,
              opacity: interpolate(frame, [166, 171, 178, 183], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: [easeOut, Easing.linear, easeIn],
              }),
              color: "rgba(255,247,231,0.66)",
              fontSize: 23,
              fontWeight: 620,
            }}
          >
            <span style={{ color: colors.grain }}>●</span>
            正在梳理可以协助的研发任务…
          </Interactive.Div>

          <Interactive.Div
            name="Agent capability answer heading"
            style={{
              position: "absolute",
              left: 478,
              top: 294,
              zIndex: 24,
              color: colors.cream,
              fontSize: 27,
              fontWeight: 780,
              opacity: interpolate(frame, [179, 185], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeOut,
              }),
              translate: interpolate(frame, [179, 185], ["20px 0px", "0px 0px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeOut,
              }),
            }}
          >
            我可以帮你：
          </Interactive.Div>

          {capabilities.map((capability, index) => (
            <CapabilityRow key={capability.title} index={index} {...capability} />
          ))}

          <Interactive.Div
            name="Confirmation boundary"
            style={{
              position: "absolute",
              left: 478,
              top: 730,
              zIndex: 25,
              display: "flex",
              alignItems: "center",
              gap: 12,
              color: "rgba(255,247,231,0.7)",
              fontSize: 21,
              fontWeight: 590,
              opacity: interpolate(frame, [217, 225], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeOut,
              }),
            }}
          >
            <span style={{ color: colors.grain }}>◆</span>
            正式写入前，需要你确认
          </Interactive.Div>

          <Interactive.Div
            name="Conversation input refocus"
            style={{
              position: "absolute",
              left: 388,
              top: 1158,
              zIndex: 22,
              width: 1752,
              height: 192,
              borderRadius: 24,
              border: "2px solid rgba(99,209,153,0.62)",
              boxShadow: "0 0 0 8px rgba(99,209,153,0.05)",
              opacity: interpolate(frame, [232, 244], [0, 1], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: easeOut,
              }),
            }}
          />
        </CameraUI>
      </Interactive.Div>

      <Interactive.Div
        name="Agent entry light response"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 70,
          pointerEvents: "none",
          backgroundColor: colors.cream,
          opacity: interpolate(frame, [45, 50, 58, 64], [0, 0.025, 0.012, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [easeInOut, Easing.linear, easeInOut],
          }),
        }}
      />

      <Interactive.Div
        name="Agent explanation veil"
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 72,
          pointerEvents: "none",
          background:
            "linear-gradient(90deg, rgba(5,14,10,0.9) 0%, rgba(5,14,10,0.68) 34%, rgba(5,14,10,0.18) 66%, transparent 100%)",
          opacity: interpolate(frame, [68, 80, 96, 108], [0, 0.86, 0.86, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.65, 0, 0.35, 1),
              Easing.linear,
              Easing.bezier(0.65, 0, 0.35, 1),
            ],
          }),
        }}
      />

      <Interactive.Div
        name="Agent explanation"
        style={{
          position: "absolute",
          left: 250,
          top: 430,
          zIndex: 74,
          width: 1160,
          pointerEvents: "none",
          color: colors.cream,
          opacity: interpolate(frame, [72, 84, 96, 108], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: [
              Easing.bezier(0.65, 0, 0.35, 1),
              Easing.linear,
              Easing.bezier(0.65, 0, 0.35, 1),
            ],
          }),
          translate: interpolate(frame, [72, 84], ["0px 24px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.65, 0, 0.35, 1),
          }),
        }}
      >
        <Interactive.Div
          name="Agent explanation title"
          style={{
            fontSize: 104,
            fontWeight: 760,
            letterSpacing: "-0.035em",
            lineHeight: 1.05,
            textShadow: "0 18px 60px rgba(3,10,7,0.34)",
          }}
        >
          Ninka Agent
        </Interactive.Div>
        <Interactive.Div
          name="Agent explanation subtitle"
          style={{
            marginTop: 34,
            color: "rgba(255,247,231,0.76)",
            fontSize: 46,
            fontWeight: 520,
            letterSpacing: "0.03em",
            lineHeight: 1.35,
          }}
        >
          用对话完成食品研发任务
        </Interactive.Div>
      </Interactive.Div>

      <Audio
        name="Original segment rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
      <Sequence from={0} durationInFrames={36} layout="none">
        <Audio
          name="Workbench camera pullback"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={0.82}
          volume={sfxVolume * 0.26}
        />
      </Sequence>
      <Sequence from={42} durationInFrames={8} layout="none">
        <Audio
          name="Native Agent entry click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.78}
        />
      </Sequence>
      <Sequence from={45} durationInFrames={24} layout="none">
        <Audio
          name="Agent workspace unfold"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={1.05}
          volume={sfxVolume * 0.34}
        />
      </Sequence>
      <Sequence from={128} durationInFrames={8} layout="none">
        <Audio
          name="Agent question focus click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.54}
        />
      </Sequence>
      <Sequence from={158} durationInFrames={8} layout="none">
        <Audio
          name="Agent question send click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.76}
        />
      </Sequence>
      {questionTickFrames.map((from, index) => (
        <Sequence
          key={`${from}-${index}`}
          from={from}
          durationInFrames={8}
          layout="none"
        >
          <Audio
            name={`Agent question type tick ${index + 1}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            playbackRate={0.98 + (index % 4) * 0.04}
            volume={sfxVolume * 0.44}
          />
        </Sequence>
      ))}
      {[183, 194, 205, 216].map((from, index) => (
        <Sequence key={from} from={from} durationInFrames={10} layout="none">
          <Audio
            name={`Agent capability snap ${index + 1}`}
            src={staticFile("audio/style-test/editorial-snap.wav")}
            playbackRate={0.95 + index * 0.06}
            volume={sfxVolume * (0.41 + index * 0.043)}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
