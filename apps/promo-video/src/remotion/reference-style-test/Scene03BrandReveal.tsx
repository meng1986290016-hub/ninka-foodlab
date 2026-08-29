import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import {
  NinkaSymbolModuleShape,
  NinkaWordmarkVector,
  ninkaSymbolModules,
} from "../motion-test/brand-vectors";
import { colors } from "../theme";
import type { ReferenceStyleTestProps } from "./schema";
import { PaperGrain, scatteredModuleOffsets, StyleTestStage } from "./shared";

const moduleLabels = [
  "原料",
  "配方",
  "营养",
  "成本",
  "版本",
  "标签",
  "记录",
  "数据",
  "研发",
];

export function Scene03BrandReveal({ productLine }: ReferenceStyleTestProps) {
  const frame = useCurrentFrame();

  return (
    <StyleTestStage>
      <PaperGrain />
      {moduleLabels.map((label, index) => {
        const offset = scatteredModuleOffsets[index]!;
        return (
          <div
            key={label}
            style={{
              position: "absolute",
              left: 1280 + offset.x * 2.15 - 55,
              top: 720 + offset.y * 1.55 - 24,
              color: colors.forest,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 1.2,
              opacity: interpolate(frame, [0, 12, 26, 42], [0, 0.68, 0.68, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              }),
            }}
          >
            {label}
          </div>
        );
      })}

      <svg
        aria-hidden="true"
        viewBox="0 0 1024 1024"
        style={{
          position: "absolute",
          left: 900,
          top: 340,
          width: 760,
          height: 760,
          overflow: "visible",
          filter: `drop-shadow(0 ${interpolate(frame, [0, 48], [32, 16], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          })}px 40px rgba(21,61,54,0.14))`,
        }}
      >
        <g
          transform={`rotate(${interpolate(frame, [0, 46], [-4, 45], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })} 512 512)`}
        >
          {ninkaSymbolModules.map((module, index) => {
            const offset = scatteredModuleOffsets[index]!;
            const progress = interpolate(frame, [3 + index * 1.2, 45], [0, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            });
            return (
              <g
                key={module.id}
                transform={`translate(${offset.x * 1.8 * (1 - progress)} ${
                  offset.y * 1.8 * (1 - progress)
                })`}
              >
                <NinkaSymbolModuleShape module={module} />
              </g>
            );
          })}
        </g>
      </svg>

      <Interactive.Div
        name="Brand-space portal"
        style={{
          position: "absolute",
          left: 1280,
          top: 720,
          width: 184,
          height: 184,
          borderRadius: 9999,
          backgroundColor: colors.forest,
          translate: "-92px -92px",
          scale: interpolate(frame, [48, 66], [0, 18], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.7, 0, 0.84, 0),
            output: "perceptual-scale",
          }),
        }}
      />

      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 30,
          opacity: interpolate(frame, [61, 70], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
        }}
      >
        <NinkaWordmarkVector
          left={416}
          top={520}
          height={218}
          reveal={interpolate(frame, [64, 79], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          })}
        />
        <Interactive.Div
          name="Product positioning"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 842,
            textAlign: "center",
            color: colors.cream,
            fontSize: 38,
            fontWeight: 650,
            letterSpacing: 4,
            opacity: interpolate(frame, [70, 81], [0, 0.74], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          {productLine}
        </Interactive.Div>
      </div>
    </StyleTestStage>
  );
}
