import {
  Easing,
  Img,
  Interactive,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";

export function LandscapeUiFrame({
  image,
  name,
  opacity = 1,
}: {
  image: string;
  name: string;
  opacity?: number;
}) {
  const frame = useCurrentFrame();

  return (
    <Interactive.Div
      name={name}
      style={{
        position: "absolute",
        top: 214,
        left: 850,
        width: 1570,
        height: 981,
        overflow: "hidden",
        border: "1px solid rgba(255,247,231,0.2)",
        borderRadius: 34,
        opacity,
        scale: interpolate(frame, [0, 24], [0.975, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.spring({ damping: 180 }),
          output: "perceptual-scale",
        }),
        translate: interpolate(frame, [0, 24], ["24px 0px", "0px 0px"], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
          easing: Easing.bezier(0.16, 1, 0.3, 1),
        }),
        boxShadow: "0 40px 120px rgba(0,0,0,0.5)",
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
