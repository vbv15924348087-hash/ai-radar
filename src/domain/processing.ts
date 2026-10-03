import type { ProcessingState } from "./content";

const TRANSITIONS: Record<ProcessingState, readonly ProcessingState[]> = {
  pending: ["processing", "failed"],
  processing: ["completed", "failed"],
  completed: ["processing"],
  failed: ["processing"],
};
export function assertTransition(from: ProcessingState, to: ProcessingState): void {
  if (!TRANSITIONS[from].includes(to)) throw new Error(`非法处理状态转换：${from} → ${to}`);
}
