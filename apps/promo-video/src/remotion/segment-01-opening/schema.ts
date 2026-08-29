import { z } from "zod";

export const segment01OpeningSchema = z.object({
  line1: z.string(),
  line2: z.string(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment01OpeningProps = z.infer<typeof segment01OpeningSchema>;

export const defaultSegment01OpeningProps: Segment01OpeningProps = {
  line1: "还在使用表格",
  line2: "来管理配方和原料吗？",
  bedVolume: 0.22,
  sfxVolume: 0.62,
};
