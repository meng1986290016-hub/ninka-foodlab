import { z } from "zod";

export const segment02ProductRevealSchema = z.object({
  positioning: z.string(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment02ProductRevealProps = z.infer<
  typeof segment02ProductRevealSchema
>;
