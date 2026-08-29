import { z } from "zod";

export const segment05AgentCapabilitiesSchema = z.object({
  question: z.string(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment05AgentCapabilitiesProps = z.infer<
  typeof segment05AgentCapabilitiesSchema
>;

