import { z } from "zod";

export const referenceStyleTestSchema = z.object({
  question: z.string(),
  productLine: z.string(),
  ingredientName: z.string(),
  ingredientSpec: z.string(),
  reviewLabel: z.string(),
  showReviewLabel: z.boolean(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type ReferenceStyleTestProps = z.infer<
  typeof referenceStyleTestSchema
>;

export const defaultReferenceStyleTestProps: ReferenceStyleTestProps = {
  question: "还在用表格管理配方和原料吗？",
  productLine: "食品研发的本地工作台",
  ingredientName: "可可粉",
  ingredientSpec: "低脂可可粉 CP-10",
  reviewLabel: "STYLE TEST · 参考语言验证",
  showReviewLabel: true,
  bedVolume: 0.34,
  sfxVolume: 0.72,
};
