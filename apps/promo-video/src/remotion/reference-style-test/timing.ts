export const STYLE_TEST_FPS = 30;

export const STYLE_TEST_TIMING = {
  formulaQuestion: { start: 0, duration: 72 },
  kineticStatement: { start: 72, duration: 96 },
  brandReveal: { start: 168, duration: 84 },
  ingredientProof: { start: 252, duration: 123 },
} as const;

export const STYLE_TEST_DURATION = 375;

export const STYLE_TEST_CUES = {
  hardReset: 72,
  secondReset: 108,
  thirdReset: 138,
  brandGather: 168,
  brandLock: 210,
  uiPortal: 246,
  ingredientClick: 330,
} as const;
