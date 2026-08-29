import type { CSSProperties } from "react";
import { Img, staticFile } from "remotion";

export const ninkaSymbolModules = [
  {
    id: "0-0",
    kind: "path",
    fill: "#EFBD50",
    center: { x: 358.487, y: 358.487 },
    d: "M 315.704 295.572 H 358.487 Q 421.402 295.572 421.402 358.487 V 358.487 Q 421.402 421.402 358.487 421.402 H 358.487 Q 295.572 421.402 295.572 358.487 V 315.704 Q 295.572 295.572 315.704 295.572 Z",
  },
  {
    id: "0-1",
    kind: "circle",
    fill: "#FFF7E7",
    center: { x: 512, y: 358.487 },
  },
  {
    id: "0-2",
    kind: "path",
    fill: "#DF6B45",
    center: { x: 665.513, y: 358.487 },
    d: "M 665.513 295.572 H 708.296 Q 728.428 295.572 728.428 315.704 V 358.487 Q 728.428 421.402 665.513 421.402 H 665.513 Q 602.598 421.402 602.598 358.487 V 358.487 Q 602.598 295.572 665.513 295.572 Z",
  },
  {
    id: "1-0",
    kind: "circle",
    fill: "#FFF7E7",
    center: { x: 358.487, y: 512 },
  },
  {
    id: "1-1",
    kind: "circle",
    fill: "#EFBD50",
    center: { x: 512, y: 512 },
  },
  {
    id: "1-2",
    kind: "circle",
    fill: "#FFF7E7",
    center: { x: 665.513, y: 512 },
  },
  {
    id: "2-0",
    kind: "path",
    fill: "#DF6B45",
    center: { x: 358.487, y: 665.513 },
    d: "M 358.487 602.598 H 358.487 Q 421.402 602.598 421.402 665.513 V 665.513 Q 421.402 728.428 358.487 728.428 H 315.704 Q 295.572 728.428 295.572 708.296 V 665.513 Q 295.572 602.598 358.487 602.598 Z",
  },
  {
    id: "2-1",
    kind: "circle",
    fill: "#FFF7E7",
    center: { x: 512, y: 665.513 },
  },
  {
    id: "2-2",
    kind: "path",
    fill: "#EFBD50",
    center: { x: 665.513, y: 665.513 },
    d: "M 665.513 602.598 H 665.513 Q 728.428 602.598 728.428 665.513 V 708.296 Q 728.428 728.428 708.296 728.428 H 665.513 Q 602.598 728.428 602.598 665.513 V 665.513 Q 602.598 602.598 665.513 602.598 Z",
  },
] as const;

export type NinkaSymbolModule = (typeof ninkaSymbolModules)[number];

export function NinkaSymbolModuleShape({ module }: { module: NinkaSymbolModule }) {
  if (module.kind === "circle") {
    return (
      <circle
        data-module={module.id}
        fill={module.fill}
        cx={module.center.x}
        cy={module.center.y}
        r={62.915}
      />
    );
  }
  return <path data-module={module.id} fill={module.fill} d={module.d} />;
}

export function NinkaSymbolVector({ style }: { style?: CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1024 1024"
      style={{ display: "block", overflow: "visible", ...style }}
    >
      <g transform="rotate(45 512 512)">
        {ninkaSymbolModules.map((module) => (
          <NinkaSymbolModuleShape key={module.id} module={module} />
        ))}
      </g>
    </svg>
  );
}

const lockupAspect = 17459.44 / 2592;
const wordmarkStartRatio = 3421.44 / 2592;

export function NinkaWordmarkVector({
  left,
  top,
  height,
  reveal,
  opacity = 1,
}: {
  left: number;
  top: number;
  height: number;
  reveal: number;
  opacity?: number;
}) {
  const width = height * lockupAspect;
  const wordmarkOffset = height * wordmarkStartRatio;
  return (
    <div
      style={{
        position: "absolute",
        left: left + wordmarkOffset,
        top,
        width: width - wordmarkOffset,
        height,
        overflow: "hidden",
        clipPath: `inset(0 ${(1 - reveal) * 100}% 0 0)`,
        opacity,
      }}
    >
      <Img
        src={staticFile("brand/ninka-lockup-horizontal-transparent.svg")}
        style={{
          position: "absolute",
          left: -wordmarkOffset,
          top: 0,
          width,
          height,
        }}
      />
    </div>
  );
}
