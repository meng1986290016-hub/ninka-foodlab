import { z } from "zod";

export const fullAssemblySchema = z.object({
  bedVolume: z.number().min(0).max(1),
  sfxVolume: z.number().min(0).max(1),
});

export type FullAssemblyProps = z.infer<typeof fullAssemblySchema>;
