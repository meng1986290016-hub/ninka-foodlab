import { z } from "zod";

export const segment09EndCardSchema = z.object({
  tagline: z.string(),
  repositoryPath: z.string(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment09EndCardProps = z.infer<typeof segment09EndCardSchema>;
