import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

import type { ReferenceStyleTestProps } from "../reference-style-test/schema";

const typeTicks = [575, 580, 585, 590, 595, 600, 605, 610];
const softWhooshes = [208, 250, 324, 403, 460, 516, 562, 630, 785, 850, 868, 914];
const clicks = [236, 368, 530, 568, 609, 773];
const snaps = [90, 174, 348, 540, 750, 945];

export function LaunchV03Soundtrack({
  bedVolume,
  sfxVolume,
}: Pick<ReferenceStyleTestProps, "bedVolume" | "sfxVolume">) {
  return (
    <>
      <Audio
        name="Temporary original rhythm bed with voiceover space"
        src={staticFile("audio/style-test/rhythm-bed.wav")}
        volume={bedVolume}
        loop
      />
      {typeTicks.map((from) => (
        <Sequence key={`type-${from}`} from={from} durationInFrames={8} layout="none">
          <Audio
            name={`Agent question typing tick ${from}`}
            src={staticFile("audio/style-test/type-tick.wav")}
            volume={sfxVolume * 0.24}
          />
        </Sequence>
      ))}
      {softWhooshes.map((from, index) => (
        <Sequence key={`whoosh-${from}`} from={from} durationInFrames={24} layout="none">
          <Audio
            name={`Continuous camera move ${from}`}
            src={staticFile("audio/style-test/soft-whoosh.wav")}
            playbackRate={index % 2 === 0 ? 1.06 : 0.96}
            volume={sfxVolume * 0.42}
          />
        </Sequence>
      ))}
      {clicks.map((from) => (
        <Sequence key={`click-${from}`} from={from} durationInFrames={8} layout="none">
          <Audio
            name={`Native UI click ${from}`}
            src={staticFile("audio/style-test/ui-click.wav")}
            volume={sfxVolume * 0.62}
          />
        </Sequence>
      ))}
      {snaps.map((from) => (
        <Sequence key={`snap-${from}`} from={from} durationInFrames={12} layout="none">
          <Audio
            name={`Editorial scene reset ${from}`}
            src={staticFile("audio/style-test/editorial-snap.wav")}
            volume={sfxVolume * 0.34}
          />
        </Sequence>
      ))}
      <Sequence from={1041} durationInFrames={42} layout="none">
        <Audio
          name="Brand lock hit"
          src={staticFile("audio/style-test/brand-hit.wav")}
          volume={sfxVolume * 0.55}
        />
      </Sequence>
    </>
  );
}
