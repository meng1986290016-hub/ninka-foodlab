import {
  Easing,
  Interactive,
  interpolate,
  useCurrentFrame,
} from "remotion";

import { colors } from "../theme";
import { OpeningModules } from "./OpeningModules";
import type { LaunchV02Props } from "./schema";
import { LaunchBackground } from "./shared";

export function Scene01Statement(props: LaunchV02Props) {
  const frame = useCurrentFrame();
  return (
    <LaunchBackground light>
      <OpeningModules phase={0} />
      <Interactive.Div
        name="Opening question first line"
        style={{
          position: "absolute",
          zIndex: 30,
          left: 250,
          top: 405,
          color: colors.forestDeep,
          fontSize: 138,
          fontWeight: 820,
          letterSpacing: "-0.055em",
          opacity: interpolate(frame, [8, 24, 72, 88], [0, 1, 1, 0.12], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [8, 24], ["0px 34px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {props.openingLine1}
      </Interactive.Div>
      <Interactive.Div
        name="Opening question second line"
        style={{
          position: "absolute",
          zIndex: 30,
          left: 250,
          top: 588,
          color: colors.forest,
          fontSize: 138,
          fontWeight: 720,
          letterSpacing: "-0.045em",
          opacity: interpolate(frame, [28, 46, 72, 88], [0, 1, 1, 0.12], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          translate: interpolate(frame, [28, 46], ["0px 34px", "0px 0px"], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
        }}
      >
        {props.openingLine2}
      </Interactive.Div>
      <div
        style={{
          position: "absolute",
          left: 250,
          top: 790,
          zIndex: 30,
          width: interpolate(frame, [42, 66], [0, 360], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.bezier(0.16, 1, 0.3, 1),
          }),
          height: 7,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${colors.tomato}, ${colors.grain})`,
        }}
      />
    </LaunchBackground>
  );
}
