/** 本课的确定性教学协议。无真实模型、网络请求、计时器或 DOM 依赖。 */
export type Difficulty = "A" | "B" | "C";
export type LogicalQuery = "today" | "yesterday";
export type Stage = "W00" | "W01" | "W02" | "W03" | "W04" | "W05" | "W06" | "W07" | "W08" | "W09" | "W10" | "W11" | "W12" | "W13";
export type TaskStatus = "idle" | "running" | "waiting" | "success" | "incomplete" | "cancelled";
export type ResultPreset = "success" | "timeout" | "wrong-date" | "missing-value" | "wrong-unit" | "wrong-metric";

export const SIMULATION = {
  city: "成都", today: "2026-09-05", yesterday: "2026-09-04",
  unit: "celsius", metric: "daily_high", maxAttempts: 2,
} as const;
export const RUN_STORAGE_NAMESPACE = "agent-lab.weather.run";
export const RUN_STORAGE_VERSION = 1;

export interface Config {
  difficulty: Difficulty;
  today: number;
  yesterday: number;
  todayCondition: string;
  yesterdayCondition: string;
}
export interface WeatherData {
  city: string;
  date: string;
  unit: string;
  metric: string;
  value: number;
  condition: string;
}
export interface WeatherRequest {
  id: string;
  logicalQuery: LogicalQuery;
  tool: "get_weather";
  city: string;
  date: string;
  unit: "celsius";
  metric: "daily_high";
  status: "proposed" | "sent";
}
export interface ToolResult {
  requestId: string;
  status: "success" | "error";
  data?: Partial<WeatherData>;
  error?: string;
  provenance?: "teaching_fixture";
}
export interface WeatherFact extends WeatherData {
  id: string;
  requestId: string;
  provenance: "teaching_fixture";
}
export interface Comparison {
  difference: number;
  description: string;
  advice: string;
  requestIds: string[];
}
type SnapshotEvent = { type: "initial" | "advance" | "cancel" } | { type: "result"; payload: ToolResult };
export interface Snapshot {
  id: string;
  revision: number;
  moduleId: "agent-lab";
  lessonId: "L03-L04";
  scenarioId: "chengdu-weather";
  stage: Stage;
  status: TaskStatus;
  request: WeatherRequest | null;
  facts: { today?: WeatherFact; yesterday?: WeatherFact };
  attempts: Record<LogicalQuery, number>;
  lastResult: ToolResult | null;
  error: string | null;
  comparison: Comparison | null;
  answer: string | null;
  stopReason: string | null;
  event: SnapshotEvent;
}
export interface Run {
  id: string;
  revision: number;
  config: Config;
  history: Snapshot[];
  cursor: number;
}

const DEFAULT_CONFIG: Config = {
  difficulty: "B", today: 30, yesterday: 22,
  todayCondition: "晴", yesterdayCondition: "雨",
};

/** 表单先校验；空值不能被 Number("") 悄悄转成 0。 */
export function validateTemperatureInput(value: unknown): { value: number | null; error: string | null } {
  if (typeof value !== "number" && typeof value !== "string") return { value: null, error: "请填写温度数值。" };
  if (typeof value === "string" && !value.trim()) return { value: null, error: "温度不能为空。" };
  const parsed = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isFinite(parsed)) return { value: null, error: "温度必须是有限数值。" };
  if (parsed < -80 || parsed > 60) return { value: null, error: "本课模拟温度范围为 −80 至 60°C。" };
  return { value: parsed, error: null };
}

function assertConfig(config: Config): void {
  if (!["A", "B", "C"].includes(config.difficulty)) throw new Error("未知课程难度。");
  for (const query of ["today", "yesterday"] as const) {
    if (typeof config[query] !== "number" || validateTemperatureInput(config[query]).error) throw new Error("模拟温度无效。");
    const condition = config[`${query}Condition`];
    if (typeof condition !== "string" || !condition.trim() || condition.length > 24) throw new Error("请填写简短的天气状态。");
  }
}

function initialSnapshot(id: string, revision: number): Snapshot {
  return {
    id: `${id}:r${revision}:e0`, revision,
    moduleId: "agent-lab", lessonId: "L03-L04", scenarioId: "chengdu-weather",
    stage: "W00", status: "idle", request: null, facts: {},
    attempts: { today: 0, yesterday: 0 }, lastResult: null, error: null,
    comparison: null, answer: null, stopReason: null, event: { type: "initial" },
  };
}

/** runId 由调用方提供可区别重开的 ID；固定默认值方便可复现的测试。 */
export function createRun(options: Partial<Config> & { runId?: string } = {}): Run {
  const { runId = "weather", ...overrides } = options;
  if (typeof runId !== "string" || !runId.length || runId.length > 150) throw new Error("运行 ID 无效。");
  const config = { ...DEFAULT_CONFIG, ...overrides };
  assertConfig(config);
  return { id: runId, revision: 0, config, history: [initialSnapshot(runId, 0)], cursor: 0 };
}

export function currentSnapshot(run: Run): Snapshot { return run.history[run.cursor]; }

function isTerminal(snapshot: Snapshot): boolean {
  return snapshot.status === "success" || snapshot.status === "incomplete" || snapshot.status === "cancelled";
}

function append(run: Run, patch: Partial<Snapshot>, event: SnapshotEvent): Run {
  const history = run.history.slice(0, run.cursor + 1);
  const next: Snapshot = {
    ...currentSnapshot(run), ...patch,
    id: `${run.id}:r${run.revision}:e${history.length}`, revision: run.revision, event,
  };
  return { ...run, history: [...history, next], cursor: history.length };
}

function requestFor(run: Run, query: LogicalQuery, status: WeatherRequest["status"]): WeatherRequest {
  const attempt = currentSnapshot(run).attempts[query] + 1;
  return {
    id: `${run.id}:r${run.revision}:${query}:attempt${attempt}`,
    logicalQuery: query, tool: "get_weather", city: SIMULATION.city,
    date: SIMULATION[query], unit: SIMULATION.unit, metric: SIMULATION.metric, status,
  };
}

function sendRequest(run: Run, query: LogicalQuery, stage: Stage): Run {
  const snapshot = currentSnapshot(run);
  if (snapshot.attempts[query] >= SIMULATION.maxAttempts) return run;
  const request = snapshot.request?.logicalQuery === query && snapshot.request.status === "proposed"
    ? { ...snapshot.request, status: "sent" as const } : requestFor(run, query, "sent");
  return append(run, {
    stage, status: "running", request, error: null, lastResult: null,
    attempts: { ...snapshot.attempts, [query]: snapshot.attempts[query] + 1 },
  }, { type: "advance" });
}

export function clothingAdvice(value: number, condition: string): string {
  const clothing = value >= 28 ? "今天最高气温较高，可选轻薄、透气的衣物。"
    : value >= 20 ? "今天最高气温适中，可选轻便衣物，按出行时段备一件薄外套。"
      : value >= 10 ? "今天最高气温偏凉，可穿长袖并带外套。"
        : "今天最高气温较低，可选择保暖外套并按实际体感调整。";
  const weather = condition.includes("雨") ? "本例天气有雨，出门可带雨具。"
    : condition.includes("雪") ? "本例天气有雪，出行可留意防滑与保暖。"
      : condition.includes("晴") ? "本例天气为晴，户外可准备遮阳用品。" : `本例天气为${condition}，出行时结合天气调整。`;
  return `${clothing}${weather}`;
}

export function calculateComparison(today: WeatherFact, yesterday: WeatherFact): Comparison {
  const places = (value: number) => {
    const [coefficient, exponent = "0"] = String(value).split("e");
    return Math.max(0, (coefficient.split(".")[1]?.length ?? 0) - Number(exponent));
  };
  const precision = Math.max(places(today.value), places(yesterday.value));
  const scale = 10 ** precision;
  // 常用小数用整数相减去掉浮点尾数；更细的合法输入也保留差值符号，
  // 不能因统一四舍五入到 3 位而把两份不同温度误说成相同。
  const difference = precision <= 12
    ? (Math.round(today.value * scale) - Math.round(yesterday.value * scale)) / scale
    : Number((today.value - yesterday.value).toPrecision(12));
  const description = difference > 0 ? `今天最高气温比昨天高 ${difference}°C`
    : difference < 0 ? `今天最高气温比昨天低 ${Math.abs(difference)}°C` : "两天最高气温相同，温差为 0°C";
  return {
    difference, description, advice: clothingAdvice(today.value, today.condition),
    requestIds: [today.requestId, yesterday.requestId],
  };
}

/** 前进只推进事件；在人工返回位置保持等待。回放已有历史不重发请求。 */
export function advance(run: Run, expectedRevision = run.revision): Run {
  if (expectedRevision !== run.revision) return run;
  if (run.cursor < run.history.length - 1) return seek(run, run.cursor + 1);
  const s = currentSnapshot(run);
  if (isTerminal(s) || s.status === "waiting") return run;
  const step = (patch: Partial<Snapshot>) => append(run, patch, { type: "advance" });
  switch (s.stage) {
    case "W00": return step({ stage: "W01", status: "running" });
    case "W01": return step({ stage: "W02" });
    case "W02": return step({ stage: "W03", request: requestFor(run, "today", "proposed") });
    case "W03": return sendRequest(run, "today", "W04");
    case "W04": return step({ stage: "W05", status: "waiting" });
    case "W06": return step({ stage: run.config.difficulty === "A" ? "W11" : "W07" });
    case "W07": return sendRequest(run, "yesterday", "W08");
    case "W08": return step({ stage: "W09", status: "waiting" });
    case "W09":
      return s.facts.today && s.facts.yesterday
        ? step({ stage: "W10", comparison: calculateComparison(s.facts.today, s.facts.yesterday) }) : run;
    case "W10": return step({ stage: "W11" });
    case "W11": {
      const complete = Boolean(s.facts.today && (run.config.difficulty === "A" || (s.facts.yesterday && s.comparison)));
      if (!complete) return step({ stage: "W13", status: "incomplete", stopReason: "目标所需的信息不齐全，不能生成确定结论。" });
      const today = s.facts.today!;
      const answer = run.config.difficulty === "A"
        ? `${SIMULATION.city} ${today.date} 的最高气温为 ${today.value}°C，天气为${today.condition}。一次查询已完成。`
        : `${SIMULATION.city}：${today.date} 最高气温 ${today.value}°C；${s.facts.yesterday!.date} 最高气温 ${s.facts.yesterday!.value}°C。${s.comparison!.description}。${s.comparison!.advice}`;
      return step({ stage: "W12", status: "success", answer, stopReason: "目标要求的信息已齐全且通过本课规则检查。" });
    }
    case "W13": return s.request ? sendRequest(run, s.request.logicalQuery, s.request.logicalQuery === "today" ? "W04" : "W08") : run;
    default: return run;
  }
}

function resultError(request: WeatherRequest, result: ToolResult): string | null {
  if (result.requestId !== request.id) return "请求 ID 不匹配：这份返回不属于当前请求。";
  if (result.status === "error") return `模拟工具查询失败：${result.error || "未获得天气数据"}`;
  if (result.status !== "success") return "返回状态无效，未获得可用数据。";
  const data = result.data;
  if (!data || typeof data !== "object") return "返回缺少天气数据。";
  if (data.city !== request.city) return `城市不匹配：本次请求的是${request.city}。`;
  if (data.date !== request.date) return `日期不匹配：本次请求的是 ${request.date}。`;
  if (data.unit !== request.unit) return "单位不匹配：本课需要摄氏度（celsius）。";
  if (data.metric !== request.metric) return "比较口径不匹配：本课需要最高气温（daily_high）。";
  if (data.value === undefined || data.value === null) return "返回缺少温度 value，不能把缺值当成 0。";
  if (typeof data.value !== "number" || validateTemperatureInput(data.value).error) return "返回温度无效：需要 −80 至 60 范围内的有限数值。";
  if (typeof data.condition !== "string" || !data.condition.trim() || data.condition.length > 24) return "返回缺少有效的天气状态 condition。";
  return null;
}

/** 只有明确提交才产生 Observation。旧修订和已处理请求的迟到回调直接忽略。 */
export function submitResult(run: Run, payload: ToolResult, expectedRevision = run.revision): Run {
  if (expectedRevision !== run.revision) return run;
  const s = currentSnapshot(run);
  if (s.status !== "waiting" || !s.request || !["W05", "W09"].includes(s.stage)) return run;
  if (payload.requestId !== s.request.id) {
    const prefix = `${run.id}:r`;
    const requestRevision = typeof payload.requestId === "string" && payload.requestId.startsWith(prefix)
      ? Number(payload.requestId.slice(prefix.length).split(":")[0]) : null;
    const oldRevision = requestRevision !== null && Number.isInteger(requestRevision) && requestRevision >= 0 && requestRevision < run.revision;
    if (oldRevision || run.history.some((h) => h.request?.id === payload.requestId)) return run;
  }
  // 在历史上的等待位置主动重新提交，会分出新修订；原未来不再可访问。
  const branch = run.cursor < run.history.length - 1 ? { ...run, revision: run.revision + 1 } : run;
  // 原始无效返回也要可持久化：NaN/Infinity 转为明确的无效文本，
  // 避免 JSON 默认把它们变为 null，导致刷新后的错误原因发生变化。
  const safePayload = JSON.parse(JSON.stringify(payload, (_key, value: unknown) =>
    typeof value === "number" && !Number.isFinite(value) ? String(value) : value,
  )) as ToolResult;
  const error = resultError(s.request, safePayload);
  if (error) {
    const exhausted = s.attempts[s.request.logicalQuery] >= SIMULATION.maxAttempts;
    return append(branch, {
      stage: "W13", status: exhausted ? "incomplete" : "running", lastResult: safePayload, error,
      stopReason: exhausted ? `同一查询已尝试 ${SIMULATION.maxAttempts} 次，仍未获得有效数据。${error}` : null,
      comparison: null, answer: null,
    }, { type: "result", payload: safePayload });
  }
  const fact: WeatherFact = {
    ...(safePayload.data as WeatherData), id: `${s.request.id}:fact`, requestId: s.request.id, provenance: "teaching_fixture",
  };
  return append(branch, {
    stage: s.request.logicalQuery === "today" ? "W06" : "W09", status: "running",
    facts: { ...s.facts, [s.request.logicalQuery]: fact }, lastResult: safePayload, error: null,
    comparison: null, answer: null, stopReason: null,
  }, { type: "result", payload: safePayload });
}

/** 只构造候选返回，调用方仍须明确 submitResult；不会改变运行。 */
export function makeResult(run: Run, preset: ResultPreset = "success", value?: number): ToolResult {
  const request = currentSnapshot(run).request;
  if (!request) throw new Error("当前还没有需要返回的请求。");
  const data: Partial<WeatherData> = {
    city: request.city, date: request.date, unit: request.unit, metric: request.metric,
    value: value ?? run.config[request.logicalQuery], condition: run.config[`${request.logicalQuery}Condition`],
  };
  if (preset === "timeout") return { requestId: request.id, status: "error", error: "本次模拟查询超时", provenance: "teaching_fixture" };
  if (preset === "wrong-date") data.date = request.date === SIMULATION.today ? SIMULATION.yesterday : SIMULATION.today;
  if (preset === "missing-value") delete data.value;
  if (preset === "wrong-unit") data.unit = "fahrenheit";
  if (preset === "wrong-metric") data.metric = "daily_low";
  return { requestId: request.id, status: "success", data, provenance: "teaching_fixture" };
}

export function seek(run: Run, index: number): Run {
  if (!Number.isInteger(index) || index < 0 || index >= run.history.length || index === run.cursor) return run;
  return { ...run, cursor: index };
}

/** 修改上游条件：仅保留已经发生且不受影响的前缀，取消旧修订的待执行事件。 */
export function reviseRun(run: Run, changes: Partial<Config>): Run {
  const config = { ...run.config, ...changes };
  assertConfig(config);
  if ((Object.keys(DEFAULT_CONFIG) as (keyof Config)[]).every((key) => config[key] === run.config[key])) return run;
  const revision = run.revision + 1;
  if (config.difficulty !== run.config.difficulty) {
    return { ...run, revision, config, cursor: 0, history: [initialSnapshot(run.id, revision)] };
  }
  const todayChanged = config.today !== run.config.today || config.todayCondition !== run.config.todayCondition;
  const visible = run.history.slice(0, run.cursor + 1);
  let keep = 0;
  for (let index = 0; index < visible.length; index += 1) {
    const snapshot = visible[index];
    const safeSetup = ["W00", "W01", "W02"].includes(snapshot.stage);
    const safeToday = !todayChanged && ["W06", "W07", "W11", "W12"].includes(snapshot.stage)
      && Boolean(snapshot.facts.today) && !snapshot.facts.yesterday && !isTerminal(snapshot);
    if (safeSetup || safeToday) keep = index;
  }
  return { ...run, revision, config, history: visible.slice(0, keep + 1), cursor: keep };
}

export function cancelRun(run: Run): Run {
  if (isTerminal(currentSnapshot(run))) return run;
  return append({ ...run, revision: run.revision + 1 }, {
    status: "cancelled", answer: null, stopReason: "你已停止本次模拟。可以查看历史，或从头开始。",
  }, { type: "cancel" });
}

export function serializeRun(run: Run): string {
  return JSON.stringify({ namespace: RUN_STORAGE_NAMESPACE, version: RUN_STORAGE_VERSION, run });
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const sameJSON = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** 恢复时重放并验证每个已存事件，拒绝损坏状态、未来事实、伪造成功与不兼容版本。 */
export function restoreRun(serialized: string): { run: Run | null; error: string | null } {
  try {
    if (typeof serialized !== "string" || serialized.length > 500_000) throw new Error("保存记录过大或格式无效。");
    const envelope: unknown = JSON.parse(serialized);
    if (!isRecord(envelope) || envelope.namespace !== RUN_STORAGE_NAMESPACE || envelope.version !== RUN_STORAGE_VERSION) throw new Error("保存记录版本不兼容，请重置本课进度。");
    const raw = envelope.run;
    if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id.length || raw.id.length > 150 || !isRecord(raw.config)
      || !Number.isInteger(raw.revision) || (raw.revision as number) < 0 || !Number.isInteger(raw.cursor)
      || !Array.isArray(raw.history) || raw.history.length < 1 || raw.history.length > 100
      || (raw.cursor as number) < 0 || (raw.cursor as number) >= raw.history.length) throw new Error("保存的运行结构无效，请重置本课进度。");
    const config = raw.config as unknown as Config;
    assertConfig(config);
    const history = raw.history as unknown[];
    const first = history[0];
    if (!isRecord(first) || !Number.isInteger(first.revision) || (first.revision as number) < 0
      || !sameJSON(first, initialSnapshot(raw.id, first.revision as number))) throw new Error("保存的起点无效。");
    let replay: Run = {
      id: raw.id, revision: first.revision as number, config,
      cursor: 0, history: [first as unknown as Snapshot],
    };
    for (let index = 1; index < history.length; index += 1) {
      const expected = history[index];
      if (!isRecord(expected) || !isRecord(expected.event) || !Number.isInteger(expected.revision)
        || (expected.revision as number) < replay.revision || (expected.revision as number) > (raw.revision as number)) throw new Error("保存的事件修订无效。");
      const revision = expected.revision as number;
      const event = expected.event;
      const previousLength = replay.history.length;
      if (event.type === "advance") replay = advance({ ...replay, revision });
      else if (event.type === "result" && isRecord(event.payload)) replay = submitResult({ ...replay, revision }, event.payload as unknown as ToolResult);
      else if (event.type === "cancel" && revision > replay.revision) replay = cancelRun({ ...replay, revision: revision - 1 });
      else throw new Error("保存记录包含未知事件。");
      if (replay.history.length !== previousLength + 1 || !sameJSON(currentSnapshot(replay), expected)) throw new Error("保存的事实或事件不一致，请重置本课进度。");
    }
    if (replay.revision > (raw.revision as number)) throw new Error("保存的修订顺序无效。");
    return { run: { ...replay, revision: raw.revision as number, cursor: raw.cursor as number }, error: null };
  } catch (error) {
    return { run: null, error: error instanceof Error ? error.message : "无法恢复本课进度，请重置后再试。" };
  }
}
