import {
  Easing,
  Interactive,
  interpolate,
  interpolateColors,
  useCurrentFrame,
} from "remotion";

import { ninkaSymbolModules } from "../motion-test/brand-vectors";
import { colors } from "../theme";
import type { ReferenceStyleTestProps } from "./schema";
import { PaperGrain, scatteredModuleOffsets, StyleTestStage } from "./shared";

export function Scene02KineticStatement(_props: ReferenceStyleTestProps) {
  const frame = useCurrentFrame();
  const darkBeat = frame >= 36 && frame < 66;
  const finalBeat = frame >= 66;

  return (
    <StyleTestStage
      background={darkBeat ? colors.forestDeep : colors.cream}
    >
      <PaperGrain dark={darkBeat} />

      {frame < 36 ? (
        <Interactive.Div
          name="Kinetic phrase one"
          style={{
            position: "absolute",
            left: 118,
            top: 420,
            display: "flex",
            alignItems: "baseline",
            gap: 36,
            color: colors.forestDeep,
            fontSize: 196,
            fontWeight: 820,
            letterSpacing: -11,
            translate: interpolate(frame, [0, 22, 34], ["-260px 0px", "0px 0px", "160px -12px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          <span style={{ fontSize: 92, letterSpacing: -4 }}>还在用</span>
          <span
            style={{
              padding: "12px 48px 30px",
              borderRadius: 999,
              backgroundColor: colors.forest,
              color: colors.cream,
            }}
          >
            表格
          </span>
        </Interactive.Div>
      ) : null}

      {darkBeat ? (
        <Interactive.Div
          name="Kinetic phrase two"
          style={{
            position: "absolute",
            left: 84,
            top: 360,
            color: colors.cream,
            fontSize: 214,
            fontWeight: 820,
            letterSpacing: -13,
            whiteSpace: "nowrap",
            translate: interpolate(frame, [36, 51, 64], ["820px 0px", "0px 0px", "-210px 0px"], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
              easing: Easing.bezier(0.16, 1, 0.3, 1),
            }),
          }}
        >
          管理
          <span style={{ color: colors.grain }}>配方</span>
        </Interactive.Div>
      ) : null}

      {finalBeat ? (
        <>
          <Interactive.Div
            name="Kinetic phrase three"
            style={{
              position: "absolute",
              left: 140,
              top: 122,
              color: colors.forestDeep,
              fontSize: 162,
              fontWeight: 820,
              letterSpacing: -8,
              opacity: interpolate(frame, [66, 72, 84, 95], [0, 1, 1, 0], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
              translate: interpolate(frame, [66, 80, 95], ["0px 160px", "0px 0px", "0px -70px"], {
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
                easing: Easing.bezier(0.16, 1, 0.3, 1),
              }),
            }}
          >
            和<span style={{ color: colors.tomato }}>原料</span>吗？
          </Interactive.Div>
          {ninkaSymbolModules.map((module, index) => {
            const offset = scatteredModuleOffsets[index]!;
            const centerX =
              900 + (module.center.x + offset.x * 1.8) * (760 / 1024);
            const centerY =
              340 + (module.center.y + offset.y * 1.8) * (760 / 1024);
            return (
              <div
                key={module.id}
                style={{
                  position: "absolute",
                  left: centerX - 84,
                  top: centerY - 42,
                  width: interpolate(frame, [72, 95], [168, 86], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  height: interpolate(frame, [72, 95], [84, 86], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  borderRadius: interpolate(frame, [72, 95], [18, 999], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                  }),
                  border: `2px solid ${module.fill}`,
                  backgroundColor: interpolateColors(
                    frame,
                    [80, 95],
                    ["rgba(255,247,231,0.68)", module.fill],
                  ),
                  opacity: interpolate(frame, [72 + index, 82 + index], [0, 1], {
                    extrapolateLeft: "clamp",
                    extrapolateRight: "clamp",
                    easing: Easing.bezier(0.16, 1, 0.3, 1),
                  }),
                  boxShadow: "0 18px 42px rgba(21,61,54,0.10)",
                }}
              />
            );
          })}
        </>
      ) : null}
    </StyleTestStage>
  );
}
