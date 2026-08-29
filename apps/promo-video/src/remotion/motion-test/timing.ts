export const motionTestFrames = {
  proposalHold: 21,
  brandBridge: 48,
  brandCrescendo: 96,
  endCard: 102,
} as const;

export const proposalBridgeDuration =
  motionTestFrames.proposalHold + motionTestFrames.brandBridge;

export const motionTestDuration =
  proposalBridgeDuration +
  motionTestFrames.brandCrescendo +
  motionTestFrames.endCard;

