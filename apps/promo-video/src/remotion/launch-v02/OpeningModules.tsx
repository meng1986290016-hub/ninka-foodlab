import { Easing, interpolate, useCurrentFrame } from "remotion";

import {
  NinkaSymbolModuleShape,
  ninkaSymbolModules,
} from "../motion-test/brand-vectors";

const origins = [
  { x: 336, y: 280 },
  { x: 820, y: 250 },
  { x: 1460, y: 276 },
  { x: 2150, y: 330 },
  { x: 410, y: 1020 },
  { x: 900, y: 1110 },
  { x: 1500, y: 1070 },
  { x: 2110, y: 980 },
  { x: 1260, y: 820 },
] as const;

const targets = [
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

const labels = [
  "原料名称",
  "供应商",
  "规格型号",
  "版本日期",
  "配方克重",
  "营养数据",
  "成本单价",
  "研发记录",
  "批次备注",
] as const;

export function OpeningModules({ phase }: { phase: number }) {
  const frame = useCurrentFrame() + phase;
  const symbolLeft = 970;
  const symbolTop = 410;
  const symbolScale = 620 / 1024;

  return (
    <>
      {origins.map((origin, index) => {
        const target = targets[index]!;
        const moveStart = 58 + index;
        const moveEnd = 108 + index * 2;
        return (
          <div
            key={labels[index]}
            style={{
              position: "absolute",
              left: interpolate(frame, [moveStart, moveEnd], [origin.x - 112, target.x - 28], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              top: interpolate(frame, [moveStart, moveEnd], [origin.y - 48, target.y - 22], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              zIndex: 4,
              width: interpolate(frame, [moveStart, moveEnd], [224, 56], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              height: interpolate(frame, [moveStart, moveEnd], [96, 44], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              border: "1px solid rgba(21,61,54,0.24)",
              borderRadius: 16,
              opacity: interpolate(frame, [8 + index * 2, 18 + index * 2, 92, 116], [0, 0.72, 0.72, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
              backgroundColor: "rgba(255,247,231,0.68)",
              color: "rgba(21,61,54,0.64)",
              fontSize: 24,
              fontWeight: 650,
              display: "flex",
              alignItems: "center",
              paddingLeft: 52,
              overflow: "hidden",
              boxShadow: "0 14px 34px rgba(21,61,54,0.08)",
            }}
          >
            {labels[index]}
          </div>
        );
      })}
      <svg
        aria-hidden="true"
        viewBox="0 0 2560 1440"
        style={{ position: "absolute", inset: 0, zIndex: 8, width: "100%", height: "100%" }}
      >
        {origins.map((origin, index) => {
          const target = targets[index]!;
          const module = ninkaSymbolModules[index]!;
          const moveStart = 58 + index;
          const moveEnd = 108 + index * 2;
          const progress = interpolate(frame, [moveStart, moveEnd], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          });
          const x = interpolate(frame, [moveStart, moveEnd], [origin.x - 78, target.x], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          });
          const y = interpolate(frame, [moveStart, moveEnd], [origin.y, target.y], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }) + Math.sin(progress * Math.PI) * (index % 2 === 0 ? -48 : 42);
          const moduleScale = interpolate(frame, [moveStart, moveEnd], [0.46, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          });
          return (
            <g
              key={module.id}
              transform={`translate(${symbolLeft} ${symbolTop}) scale(${symbolScale}) translate(${(x - target.x) / symbolScale} ${(y - target.y) / symbolScale})`}
              style={{ filter: "drop-shadow(0 7px 14px rgba(21,61,54,0.18))" }}
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
    </>
  );
}
