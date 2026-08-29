import { z } from "zod";

export const combinedCurrentThroughAgentSchema = z.object({
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type CombinedCurrentThroughAgentProps = z.infer<
  typeof combinedCurrentThroughAgentSchema
>;

