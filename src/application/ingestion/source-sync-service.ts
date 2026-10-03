import { randomUUID } from "node:crypto";
import type { AIProvider, SemanticDeduplicator, SourceAdapter } from "@/application/ports";
import type { RadarRepository } from "@/application/repository";
import type { ContentItem, RawItem } from "@/domain/content";
import type { Source, SourceType } from "@/domain/source";
import type { ProcessingFailure, SyncRun } from "@/domain/sync";
import { analyzeContent, stage, StageError } from "@/application/processing/analyze";
import { deduplicateContent } from "./deduplicate";

export class SyncBusyError extends Error {}
export interface SyncOptions { sourceId?: string; retry?: boolean }
export class SourceSyncService {
  constructor(private readonly repository: RadarRepository,
    private readonly adapters: ReadonlyMap<SourceType, SourceAdapter>,
    private readonly provider: AIProvider,
    private readonly semantic?: SemanticDeduplicator) {}

  async sync(options: SyncOptions = {}): Promise<SyncRun[]> {
    const selected = options.sourceId ? [this.repository.getSource(options.sourceId)] : this.repository.listSources().filter(source => source.enabled);
    if (selected.some(source => !source)) throw new Error("来源不存在");
    const owner = randomUUID();
    if (!this.repository.acquireLock(owner)) throw new SyncBusyError("已有同步正在运行，请稍后查看结果");
    try {
      const runs: SyncRun[] = [];
      for (const source of selected) if (source) {
        this.repository.renewLock(owner);
        runs.push(await this.syncSource(source, options.retry ?? false, owner));
      }
      return runs;
    } finally { this.repository.releaseLock(owner); }
  }

  private async syncSource(source: Source, retry: boolean, owner: string): Promise<SyncRun> {
    const run: SyncRun = { id: randomUUID(), sourceId: source.id, state: "processing", startedAt: new Date().toISOString(),
      finishedAt: null, durationMs: 0, discovered: 0, fetched: 0, duplicates: 0, analyzed: 0, failed: 0, aiDurationMs: 0, errors: [] };
    const started = performance.now();
    const previous = this.repository.listRuns(100).find(entry => entry.sourceId === source.id);
    const processed = new Set<string>();
    this.repository.saveRun(run);
    try {
      if (retry) {
        for (const content of this.repository.retryableContents(source.id, this.provider.name !== "development")) {
          await this.processOne(run, () => this.processExisting(content, run));
          processed.add(content.id);
          this.repository.renewLock(owner);
        }
      }
      if (!retry || previous?.errors.some(error => !error.contentItemId)) {
        const adapter = this.adapters.get(source.type);
        if (!adapter) throw new StageError("discover", new Error(`未配置 ${source.type} Adapter`));
        const rawItems = await stage("discover", () => adapter.discover(source));
        run.discovered = rawItems.length;
        this.repository.saveRun(run);
        for (const raw of rawItems) {
          await this.processOne(run, () => this.ingestRaw(raw, source, adapter, run, processed), raw.externalId);
          this.repository.renewLock(owner);
        }
      }
    } catch (error) { this.recordFailure(run, error); }
    run.state = run.failed ? "failed" : "completed";
    run.finishedAt = new Date().toISOString();
    run.durationMs = Math.round(performance.now() - started);
    this.repository.saveRun(run);
    this.repository.markSourceChecked(source.id, run.errors[0]?.error ?? null);
    // Logs intentionally contain counts and stages, never raw content or credentials.
    console.info(JSON.stringify({ event: "source_sync", sourceId: source.id, runId: run.id, state: run.state,
      durationMs: run.durationMs, discovered: run.discovered, fetched: run.fetched, duplicates: run.duplicates,
      analyzed: run.analyzed, failed: run.failed, aiDurationMs: run.aiDurationMs }));
    return run;
  }

  private async ingestRaw(raw: RawItem, source: Source, adapter: SourceAdapter, run: SyncRun, processed: Set<string>) {
    const fetched = await stage("fetch", () => adapter.fetch(raw, source));
    run.fetched++;
    const draft = await stage("normalize", () => adapter.normalize(fetched, source));
    const result = await stage("deduplicate", () => deduplicateContent(this.repository, draft, this.semantic));
    if (result.duplicate) {
      run.duplicates++;
      if (result.content.state === "completed" || processed.has(result.content.id)) return;
    }
    processed.add(result.content.id);
    await this.processExisting(result.content, run);
  }
  private async processExisting(content: ContentItem, run: SyncRun) {
    const started = performance.now();
    try {
      await analyzeContent(this.repository, this.provider, content, this.repository.listTopics());
      run.analyzed++;
    } catch (error) {
      const failed = this.repository.getContent(content.id);
      const failure = this.toFailure(error, failed?.attempts ?? content.attempts + 1);
      failure.contentItemId = content.id;
      failure.externalId = content.externalId;
      throw Object.assign(error instanceof Error ? error : new Error("分析失败"), { failure });
    } finally { run.aiDurationMs += Math.round(performance.now() - started); }
  }
  private async processOne(run: SyncRun, action: () => Promise<void>, externalId?: string) {
    try { await action(); } catch (error) { this.recordFailure(run, error, externalId); }
    this.repository.saveRun(run);
  }
  private toFailure(error: unknown, attempts = 1): ProcessingFailure {
    const message = (error instanceof Error ? error.message : "未知错误").slice(0, 600);
    const httpStatus = Number(message.match(/HTTP\s+(\d{3})/)?.[1] ?? 0);
    const retryable = httpStatus ? httpStatus === 408 || httpStatus === 429 || httpStatus >= 500 :
      !/missing|not configured|api.key|bearer|配置/i.test(message);
    return { stage: error instanceof StageError ? error.stage : "discover", error: message,
      retryable, attempts, timestamp: new Date().toISOString() };
  }
  private recordFailure(run: SyncRun, error: unknown, externalId?: string) {
    const failure = error instanceof Error && "failure" in error ? error.failure as ProcessingFailure : this.toFailure(error);
    if (!failure.contentItemId) {
      const previous = this.repository.listRuns(100).find(entry => entry.sourceId === run.sourceId && entry.id !== run.id);
      const priorFailure = previous?.errors.find(entry => entry.stage === failure.stage && entry.externalId === externalId);
      failure.attempts = (priorFailure?.attempts ?? 0) + 1;
    }
    run.failed++;
    run.errors.push({ ...failure, ...(externalId ? { externalId } : {}) });
  }
}
