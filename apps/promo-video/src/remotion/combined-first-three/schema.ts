import { z } from "zod";

export const combinedFirstThreeSchema = z.object({
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type CombinedFirstThreeProps = z.infer<typeof combinedFirstThreeSchema>;
