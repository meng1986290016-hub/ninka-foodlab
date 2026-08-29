import { z } from "zod";

export const promoSchema = z.object({
  cta: z.string(),
  repositoryPath: z.string(),
  demoBadge: z.string(),
  musicFile: z.string(),
  musicVolume: z.number().min(0).max(1),
});

export type PromoProps = z.infer<typeof promoSchema>;
