import { z } from "zod";

export const segment04WorkbenchRecalculationSchema = z.object({
  recalcStatement: z.string(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment04WorkbenchRecalculationProps = z.infer<
  typeof segment04WorkbenchRecalculationSchema
>;
