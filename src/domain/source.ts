import { z } from "zod";

export const SOURCE_TYPES = ["RSS", "GitHub", "Blog", "Paper", "YouTube", "X"] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];
export const sourceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: z.enum(SOURCE_TYPES),
  urlOrIdentifier: z.string().trim().min(1).max(2000),
  enabled: z.boolean().default(true),
  priority: z.number().int().min(1).max(5).default(3),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type SourceInput = z.infer<typeof sourceInputSchema>;
export const sourceUpdateSchema = z.object({
  name: sourceInputSchema.shape.name.optional(), type: sourceInputSchema.shape.type.optional(),
  urlOrIdentifier: sourceInputSchema.shape.urlOrIdentifier.optional(),
  enabled: sourceInputSchema.shape.enabled.removeDefault().optional(),
  priority: sourceInputSchema.shape.priority.removeDefault().optional(),
  metadata: sourceInputSchema.shape.metadata.removeDefault().optional(),
}).strict();
export interface Source extends SourceInput {
  id: string;
  lastCheckedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}
