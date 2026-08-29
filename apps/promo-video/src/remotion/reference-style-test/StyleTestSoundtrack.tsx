import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

import type { ReferenceStyleTestProps } from "./schema";
import { STYLE_TEST_CUES } from "./timing";

const typingFrames = [
  11, 15, 19, 23, 27, 31, 35, 39, 43, 47, 51, 55, 59,
];

export function StyleTestSoundtrack({
  bedVolume,
  sfxVolume,
}: ReferenceStyleTestProps) {
  return (
    <>
      <Audio
        name="Original synthetic rhythm bed"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
      />
      {typingFrames.map((from) => (
        <Sequence key={from} from={from} durationInFrames={8} layout="none">
          <Audio
            name={`Typing tick ${from}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            volume={sfxVolume * 0.32}
          />
        </Sequence>
      ))}
      {[STYLE_TEST_CUES.hardReset, STYLE_TEST_CUES.secondReset, STYLE_TEST_CUES.thirdReset].map(
        (from) => (
          <Sequence key={from} from={from} durationInFrames={12} layout="none">
            <Audio
              name={`Editorial reset ${from}`}
              src={staticFile("audio/style-test/editorial-snap.wav")}
              volume={sfxVolume * 0.46}
            />
          </Sequence>
        ),
      )}
      <Sequence from={STYLE_TEST_CUES.brandGather} durationInFrames={24} layout="none">
        <Audio
          name="Brand gather whoosh"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          volume={sfxVolume * 0.64}
        />
      </Sequence>
      <Sequence from={STYLE_TEST_CUES.brandLock} durationInFrames={42} layout="none">
        <Audio
          name="Ninka brand hit"
          src={staticFile("audio/style-test/brand-hit.wav")}
          volume={sfxVolume * 0.62}
        />
      </Sequence>
      <Sequence from={STYLE_TEST_CUES.uiPortal} durationInFrames={24} layout="none">
        <Audio
          name="UI portal whoosh"
          src={staticFile("audio/style-test/soft-whoosh.wav")}
          playbackRate={1.08}
          volume={sfxVolume * 0.58}
        />
      </Sequence>
      <Sequence from={STYLE_TEST_CUES.ingredientClick} durationInFrames={8} layout="none">
        <Audio
          name="Ingredient focus click"
          src={staticFile("audio/style-test/ui-click.wav")}
          volume={sfxVolume * 0.7}
        />
      </Sequence>
    </>
  );
}
