import { Easing, interpolate, useCurrentFrame } from "remotion";

import type { LaunchV02Props } from "./schema";
import {
  CaptureStage,
  CursorActor,
  DemoBadge,
  FocusCallout,
  LaunchBackground,
} from "./shared";

export function Scene03Ingredients(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  const cameraScale = interpolate(frame, [0, 149], [1, 1.035], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  return (
    <LaunchBackground>
      <CaptureStage
        image="ingredients.png"
        name="Ingredient library base state"
        scale={cameraScale}
        opacity={interpolate(frame, [68, 90], [1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <CaptureStage
        image="ingredients-nutrition.png"
        name="Ingredient nutrition detail state"
        scale={cameraScale}
        opacity={interpolate(frame, [68, 90], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 32,
          left: 510,
          top: 727,
          width: 468,
          height: 98,
          border: "3px solid rgba(239,189,80,0.82)",
          borderRadius: 18,
          opacity: interpolate(frame, [16, 28, 114, 140], [0, 1, 1, 0.38], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          boxShadow: "0 0 0 10px rgba(239,189,80,0.08)",
        }}
      />
      <CursorActor
        left={interpolate(frame, [0, 28, 82, 118], [380, 708, 890, 1760], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        top={interpolate(frame, [0, 28, 82, 118], [1120, 770, 520, 486], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        })}
        pressed={frame >= 25 && frame <= 30}
      />
      <FocusCallout
        left={540}
        top={850}
        opacity={interpolate(frame, [20, 34, 52, 66], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      >
        按通用原料归类
      </FocusCallout>
      <FocusCallout
        left={1390}
        top={515}
        opacity={interpolate(frame, [54, 70, 86, 98], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      >
        供应商、型号与价格
      </FocusCallout>
      <FocusCallout
        left={1780}
        top={270}
        opacity={interpolate(frame, [92, 108, 132, 146], [0, 1, 1, 0], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })}
      >
        营养数据与完整度
      </FocusCallout>
      <DemoBadge text={props.demoBadge} />
    </LaunchBackground>
  );
}
