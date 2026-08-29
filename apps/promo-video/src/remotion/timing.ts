export const FPS = 30;

export const sceneFrames = {
  intro: 75,
  ingredients: 210,
  agent: 600,
  workbench: 270,
  label: 120,
  cta: 75,
} as const;

export const PROMO_DURATION = Object.values(sceneFrames).reduce(
  (total, duration) => total + duration,
  0,
);

export const reviewFrames = [38, 180, 765, 1070, 1215, 1312] as const;
