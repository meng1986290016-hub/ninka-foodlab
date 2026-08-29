export function getCharacterRevealFrames({
  characterCount,
  endFrame,
  startFrame,
}: {
  characterCount: number;
  endFrame: number;
  startFrame: number;
}) {
  if (characterCount <= 0) {
    return [];
  }

  return Array.from({ length: characterCount }, (_, index) =>
    Math.ceil(
      startFrame +
        ((index + 1) * (endFrame - startFrame)) / characterCount,
    ),
  );
}
