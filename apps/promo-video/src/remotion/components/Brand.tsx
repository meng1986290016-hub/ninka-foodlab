import { Img, Interactive, staticFile } from "remotion";

export function BrandSymbol({ size = 180 }: { size?: number }) {
  return (
    <Img
      name="Ninka FoodLab symbol"
      src={staticFile("brand/ninka-symbol-color-dark.svg")}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

export function BrandLockup({ width = 620 }: { width?: number }) {
  return (
    <Interactive.Div name="Ninka FoodLab lockup">
      <Img
        src={staticFile("brand/ninka-lockup-horizontal-dark.svg")}
        style={{ width, height: "auto", objectFit: "contain" }}
      />
    </Interactive.Div>
  );
}
