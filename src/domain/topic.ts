import { z } from "zod";
export const topicInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(1000).default(""),
  keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(30),
  weight: z.number().min(0.1).max(5).default(1),
});
export type TopicInput = z.infer<typeof topicInputSchema>;
export const topicUpdateSchema = z.object({
  name: topicInputSchema.shape.name.optional(), description: topicInputSchema.shape.description.removeDefault().optional(),
  keywords: topicInputSchema.shape.keywords.optional(), weight: topicInputSchema.shape.weight.removeDefault().optional(),
}).strict();
export interface Topic extends TopicInput { id: string }
