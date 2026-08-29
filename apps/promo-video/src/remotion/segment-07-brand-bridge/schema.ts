import { z } from "zod";

export const segment07BrandBridgeSchema = z.object({
  formulaPrompt: z.string(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment07BrandBridgeProps = z.infer<
  typeof segment07BrandBridgeSchema
>;
