import {
  AbsoluteFill,
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import {
  NinkaSymbolModuleShape,
  ninkaSymbolModules,
} from "./brand-vectors";
import type { MotionTestProps } from "./schema";
import { BrandAtmosphere, MotionTestLabel } from "./shared";
import { motionTestFrames } from "./timing";

const ingredients = [
  ["饮用水", "894 g"],
  ["脱脂乳粉", "50 g"],
  ["可可粉", "28 g"],
  ["赤藓糖醇", "25 g"],
  ["白砂糖", "2 g"],
  ["复配稳定剂", "1 g"],
] as const;

const statuses = ["读取原料库", "完成确定性试算", "生成配方提案"] as const;

const nodeOrigins = [
  { x: 654, y: 385, kind: "status" },
  { x: 1120, y: 385, kind: "status" },
  { x: 1586, y: 385, kind: "status" },
  { x: 625, y: 608, kind: "row" },
  { x: 625, y: 699, kind: "row" },
  { x: 625, y: 790, kind: "row" },
  { x: 625, y: 881, kind: "row" },
  { x: 625, y: 972, kind: "row" },
  { x: 625, y: 1063, kind: "row" },
] as const;

const nodeTargets = [
  { x: 1280, y: 588 },
  { x: 1346, y: 654 },
  { x: 1412, y: 720 },
  { x: 1214, y: 654 },
  { x: 1280, y: 720 },
  { x: 1346, y: 786 },
  { x: 1148, y: 720 },
  { x: 1214, y: 786 },
  { x: 1280, y: 852 },
] as const;

function ProposalInterface({ demoBadge }: { demoBadge: string }) {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name="Synthetic Ninka Agent proposal stage"
      style={{
        position: "absolute",
        inset: 0,
        opacity: interpolate(
          frame,
          [motionTestFrames.proposalHold, 48],
          [1, 0],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
        ),
        scale: interpolate(
          frame,
          [motionTestFrames.proposalHold, 52],
          [1, 1.34],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
        ),
        filter: `blur(${interpolate(frame, [motionTestFrames.proposalHold, 48], [0, 18], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}px)`,
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: colors.forestDeep,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width: 350,
          height: "100%",
          borderRight: "1px solid rgba(255,247,231,0.09)",
          backgroundColor: "#0D1915",
          color: colors.cream,
          padding: "64px 48px",
        }}
      >
        <div style={{ fontSize: 27, color: colors.grain, fontWeight: 700 }}>
          NINKA AGENT
        </div>
        <div style={{ marginTop: 18, fontSize: 38, fontWeight: 720 }}>
          食品研发助手对话
        </div>
        <div
          style={{
            marginTop: 70,
            padding: "22px 24px",
            borderRadius: 20,
            backgroundColor: "rgba(255,247,231,0.055)",
            fontSize: 26,
          }}
        >
          低糖可可饮品提案
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 350,
          right: 0,
          top: 0,
          height: 112,
          borderBottom: "1px solid rgba(255,247,231,0.09)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 74px",
          color: colors.cream,
        }}
      >
        <div>
          <div style={{ color: colors.grain, fontSize: 21, fontWeight: 700 }}>
            NINKA AGENT
          </div>
          <div style={{ marginTop: 6, fontSize: 30, fontWeight: 700 }}>
            低糖可可饮品 · 配方提案
          </div>
        </div>
        <div
          style={{
            border: `1px solid ${colors.grain}`,
            borderRadius: 999,
            padding: "12px 24px",
            color: colors.grain,
            fontSize: 23,
            fontWeight: 700,
          }}
        >
          {demoBadge}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 500,
          top: 180,
          width: 1560,
          height: 1060,
          border: "1px solid rgba(255,247,231,0.12)",
          borderRadius: 34,
          backgroundColor: "rgba(23,33,29,0.94)",
          boxShadow: "0 36px 90px rgba(0,0,0,0.28)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "54px 76px 42px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ color: colors.cream, fontSize: 50, fontWeight: 760 }}>
                低糖方向可可饮品
              </div>
              <div
                style={{
                  marginTop: 13,
                  color: "rgba(255,247,231,0.56)",
                  fontSize: 24,
                }}
              >
                已结合原料库完成投料、营养与成本试算
              </div>
            </div>
            <div
              style={{
                borderRadius: 999,
                padding: "13px 22px",
                backgroundColor: "rgba(239,189,80,0.12)",
                color: colors.grain,
                fontSize: 24,
                fontWeight: 700,
              }}
            >
              待复核
            </div>
          </div>
          <div
            style={{
              marginTop: 45,
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 24,
            }}
          >
            {statuses.map((status) => (
              <div
                key={status}
                style={{
                  minHeight: 78,
                  display: "flex",
                  alignItems: "center",
                  gap: 18,
                  padding: "0 26px 0 58px",
                  borderRadius: 20,
                  border: "1px solid rgba(255,247,231,0.10)",
                  backgroundColor: "rgba(255,247,231,0.035)",
                  color: "rgba(255,247,231,0.78)",
                  fontSize: 24,
                  fontWeight: 620,
                }}
              >
                {status}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 42,
              borderRadius: 24,
              border: "1px solid rgba(255,247,231,0.09)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: 70,
                display: "grid",
                gridTemplateColumns: "1fr 240px",
                alignItems: "center",
                padding: "0 44px 0 82px",
                backgroundColor: "rgba(255,247,231,0.045)",
                color: "rgba(255,247,231,0.48)",
                fontSize: 22,
                fontWeight: 650,
              }}
            >
              <span>原料</span>
              <span style={{ textAlign: "right" }}>演示用量</span>
            </div>
            {ingredients.map(([name, amount]) => (
              <div
                key={name}
                style={{
                  height: 91,
                  display: "grid",
                  gridTemplateColumns: "1fr 240px",
                  alignItems: "center",
                  padding: "0 44px 0 82px",
                  borderTop: "1px solid rgba(255,247,231,0.07)",
                  color: colors.cream,
                  fontSize: 27,
                }}
              >
                <span>{name}</span>
                <span style={{ textAlign: "right", fontWeight: 700 }}>{amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Interactive.Div>
  );
}

function MovingBrandNodes() {
  const frame = useCurrentFrame();
  const symbolLeft = 970;
  const symbolTop = 410;
  const symbolScale = 620 / 1024;
  const initialModuleScale = 24 / (62.915 * 2 * symbolScale);
  return (
    <Interactive.Div
      name="Nine exact Ninka modules moving from proposal into the symbol"
      style={{ position: "absolute", inset: 0, zIndex: 20 }}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 2560 1440"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      >
      {nodeOrigins.map((origin, index) => {
        const target = nodeTargets[index]!;
        const module = ninkaSymbolModules[index]!;
        const moveStart = 24 + index;
        const moveEnd = 56 + index;
        const progress = interpolate(frame, [moveStart, moveEnd], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });
        const arc = Math.sin(progress * Math.PI) * (index % 2 === 0 ? -86 : 72);
        const x = interpolate(frame, [moveStart, moveEnd], [origin.x, target.x], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        });
        const y = interpolate(frame, [moveStart, moveEnd], [origin.y, target.y], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }) + arc;
        const moduleScale = interpolate(
          frame,
          [moveStart, moveEnd],
          [initialModuleScale, 1],
          {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          },
        );
        const translateX = (x - target.x) / symbolScale;
        const translateY = (y - target.y) / symbolScale;
        return (
          <g
            key={module.id}
            transform={`translate(${symbolLeft} ${symbolTop}) scale(${symbolScale}) translate(${translateX} ${translateY})`}
            style={{
              filter: `drop-shadow(0 0 ${18 + progress * 26}px rgba(255,247,231,${0.08 + progress * 0.08}))`,
            }}
          >
            <g transform="rotate(45 512 512)">
              <g
                transform={`translate(${module.center.x} ${module.center.y}) scale(${moduleScale}) translate(${-module.center.x} ${-module.center.y})`}
              >
                <NinkaSymbolModuleShape module={module} />
              </g>
            </g>
          </g>
        );
      })}
      </svg>
    </Interactive.Div>
  );
}

export function ProposalBridgeScene(props: MotionTestProps) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        overflow: "hidden",
        backgroundColor: colors.forest,
        fontFamily: '"Noto Sans SC Variable", "PingFang SC", sans-serif',
      }}
    >
      <BrandAtmosphere />
      <div
        style={{
          position: "absolute",
          inset: -120,
          background:
            "radial-gradient(circle at 50% 50%, rgba(239,189,80,0.11), rgba(21,61,54,0) 54%)",
          opacity: interpolate(frame, [36, 52, 68], [0, 0.72, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [36, 68], [0.86, 1.08], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <ProposalInterface demoBadge={props.demoBadge} />
      <MovingBrandNodes />
      <div
        style={{
          position: "absolute",
          left: 1280,
          top: 720,
          width: 560,
          height: 560,
          marginLeft: -280,
          marginTop: -280,
          borderRadius: "50%",
          border: "2px solid rgba(255,247,231,0.16)",
          opacity: interpolate(frame, [45, 56, 68], [0, 0.7, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          scale: interpolate(frame, [45, 68], [0.35, 1.2], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      />
      <MotionTestLabel visible={props.showReviewLabel} />
    </AbsoluteFill>
  );
}
