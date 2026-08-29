import { z } from "zod";

export const segment06AgentProposalSchema = z.object({
  formulaPrompt: z.string(),
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type Segment06AgentProposalProps = z.infer<
  typeof segment06AgentProposalSchema
>;

