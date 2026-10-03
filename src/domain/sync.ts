export const PIPELINE_STAGES = ["discover", "fetch", "normalize", "deduplicate", "classify", "score", "summarize", "persist"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];
export interface ProcessingFailure {
  stage: PipelineStage;
  error: string;
  retryable: boolean;
  attempts: number;
  timestamp: string;
  externalId?: string;
  contentItemId?: string;
}
export interface SyncRun {
  id: string;
  sourceId: string;
  state: "processing" | "completed" | "failed";
  startedAt: string;
  finishedAt: string | null;
  durationMs: number;
  discovered: number;
  fetched: number;
  duplicates: number;
  analyzed: number;
  failed: number;
  aiDurationMs: number;
  errors: ProcessingFailure[];
}
