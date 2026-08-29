import { z } from "zod";

export const launchV02Schema = z.object({
  openingLine1: z.string(),
  openingLine2: z.string(),
  positioning: z.string(),
  recalcStatement: z.string(),
  capabilityPrompt: z.string(),
  formulaPrompt: z.string(),
  tagline: z.string(),
  cta: z.string(),
  demoBadge: z.string(),
  showReviewLabel: z.boolean(),
});

export type LaunchV02Props = z.infer<typeof launchV02Schema>;

export const defaultLaunchV02Props: LaunchV02Props = {
  openingLine1: "还在用表格",
  openingLine2: "管理配方和原料吗？",
  positioning: "食品研发的本地工作台",
  recalcStatement: "改一处，整份配方一起复算。",
  capabilityPrompt: "你能帮我干些什么？",
  formulaPrompt:
    "请根据原料库里的现有原料，帮我生成一份低糖方向的可可饮品配方提案。",
  tagline: "食品研发的本地工作台",
  cta: "",
  demoBadge: "演示数据",
  showReviewLabel: true,
};
