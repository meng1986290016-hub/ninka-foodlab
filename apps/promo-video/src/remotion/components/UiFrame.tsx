import {
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

export function UiFrame({
  image,
  name,
  opacity = 1,
  top = 460,
}: {
  image: string;
  name: string;
  opacity?: number;
  top?: number;
}) {
  const frame = useCurrentFrame();
  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        top,
        left: 70,
        width: 940,
        height: 588,
        overflow: "hidden",
        border: "1px solid rgba(255,247,231,0.18)",
        borderRadius: 28,
        opacity,
        scale: interpolate(frame, [0, 24], [0.965, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.spring({ damping: 180 }),
          output: "perceptual-scale",
        }),
        boxShadow: "0 34px 100px rgba(0,0,0,0.48)",
        backgroundColor: "#101714",
      }}
    >
      <Img
        src={staticFile(`captures/${image}`)}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </Interactive.Div>
  );
}
