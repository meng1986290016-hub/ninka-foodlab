import { z } from "zod";

export const motionTestSchema = z.object({
  tagline: z.string(),
  cta: z.string(),
  demoBadge: z.string(),
  showReviewLabel: z.boolean(),
});

export type MotionTestProps = z.infer<typeof motionTestSchema>;

export const defaultMotionTestProps: MotionTestProps = {
  tagline: "食品研发的本地工作台",
  cta: "",
  demoBadge: "演示数据",
  showReviewLabel: true,
};

