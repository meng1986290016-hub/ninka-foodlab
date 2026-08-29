import type { ReactNode } from "react";
import { CanvasImage, Interactive, staticFile } from "remotion";
import { colors } from "../theme";

export const CAMERA_STAGE = {
  left: 180,
  top: 88,
  width: 2200,
  height: 1375,
} as const;

export function CameraUI({
  blur = 0,
  children,
  name,
  opacity = 1,
  scale,
  translateX,
  translateY,
}: {
  blur?: number;
  children: ReactNode;
  name: string;
  opacity?: number;
  scale: number;
  translateX: number;
  translateY: number;
}) {
  return (
    <Interactive.Div
      name={`${name} camera position`}
      style={{
        position: "absolute",
        left: CAMERA_STAGE.left,
        top: CAMERA_STAGE.top,
        width: CAMERA_STAGE.width,
        height: CAMERA_STAGE.height,
        translate: `${translateX}px ${translateY}px`,
        zIndex: 20,
      }}
    >
      <Interactive.Div
        name={`${name} camera zoom`}
        style={{
          position: "absolute",
          inset: 0,
          width: CAMERA_STAGE.width,
          height: CAMERA_STAGE.height,
          transformOrigin: "0 0",
          scale,
          opacity,
          filter: `blur(${blur}px)`,
        }}
      >
        <Interactive.Div
          name={name}
          style={{
            position: "absolute",
            inset: 0,
            width: CAMERA_STAGE.width,
            height: CAMERA_STAGE.height,
            overflow: "hidden",
            border: "2px solid rgba(255,247,231,0.20)",
            borderRadius: 42,
            backgroundColor: colors.forestDeep,
            boxShadow: "0 68px 150px rgba(4,12,9,0.48)",
          }}
        >
          {children}
        </Interactive.Div>
      </Interactive.Div>
    </Interactive.Div>
  );
}

export function CameraImage({
  image,
  name,
  opacity = 1,
}: {
  image: string;
  name: string;
  opacity?: number;
}) {
  return (
    <CanvasImage
      name={name}
      src={staticFile(`captures/${image}`)}
      width={CAMERA_STAGE.width}
      height={CAMERA_STAGE.height}
      style={{ position: "absolute", inset: 0, opacity }}
    />
  );
}

export function CameraCursor({
  left,
  opacity = 1,
  pressed = false,
  top,
}: {
  left: number;
  opacity?: number;
  pressed?: boolean;
  top: number;
}) {
  return (
    <Interactive.Svg
      name="Supporting UI cursor"
      viewBox="0 0 64 84"
      style={{
        position: "absolute",
        left,
        top,
        zIndex: 30,
        width: 44,
        height: 58,
        opacity,
        scale: pressed ? 0.86 : 1,
        filter: "drop-shadow(0 8px 8px rgba(0,0,0,0.30))",
      }}
    >
      <path
        d="M7 4L55 49L36 53L46 76L35 81L25 58L11 72Z"
        fill={colors.cream}
        stroke={colors.forest}
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </Interactive.Svg>
  );
}

export function ClickPulse({
  left,
  opacity,
  scale,
  top,
}: {
  left: number;
  opacity: number;
  scale: number;
  top: number;
}) {
  return (
    <Interactive.Div
      name="Native target click feedback"
      style={{
        position: "absolute",
        left,
        top,
        zIndex: 24,
        width: 96,
        height: 96,
        border: `4px solid ${colors.grain}`,
        borderRadius: 9999,
        opacity,
        scale,
      }}
    />
  );
}
