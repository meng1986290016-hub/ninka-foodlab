import { z } from "zod";

export const segment08BrandRevealSchema = z.object({
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment08BrandRevealProps = z.infer<
  typeof segment08BrandRevealSchema
>;
