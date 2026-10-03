import {
  advance,
  cancelRun,
  createRun,
  currentSnapshot,
  makeResult,
  restoreRun,
  reviseRun,
  seek as seekRun,
  serializeRun,
  submitResult,
  type Config,
  type ResultPreset,
  type Run,
  type ToolResult,
} from "./engine";

export const PLAYER_STORAGE_KEY = "ai-learning:agent-lab:weather:player:v1";
export const LEARNING_STORAGE_KEY = "ai-learning:agent-lab:weather:learning:v1";
export const PLAYER_VERSION = 1;
export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2;
export type PlaybackPace = "guided" | "continuous";
export type ResultMode = "manual" | "auto";

export interface LearningAnswer {
  value: string;
  correct: boolean;
  revision: number;
  runId: string;
}

export interface LearningProgress {
  visited: string[];
  operations: string[];
  answers: Record<string, LearningAnswer>;
}

export interface PlayerState {
  run: Run;
  phase: "paused" | "playing" | "explaining";
  progress: number;
  speed: PlaybackSpeed;
  pace: PlaybackPace;
  resultMode: ResultMode;
  glossaryId: string | null;
  replaying: boolean;
  stepping: boolean;
  generation: number;
  reducedMotion: boolean;
  learning: LearningProgress;
  notice: string | null;
}

export type PlayerAction =
  | { type: "play" }
  | { type: "pause" }
  | { type: "next" }
  | { type: "back" }
  | { type: "seek"; index: number }
  | { type: "replay" }
  | { type: "restart"; runId: string }
  | { type: "stop" }
  | { type: "speed"; speed: PlaybackSpeed }
  | { type: "pace"; pace: PlaybackPace }
  | { type: "result-mode"; mode: ResultMode }
  | { type: "open-glossary"; id: string }
  | { type: "close-glossary" }
  | { type: "revise"; config: Partial<Config> }
  | { type: "submit"; result: ToolResult; expectedRevision?: number; expectedRunId?: string }
  | { type: "submit-preset"; preset: ResultPreset; value?: number }
  | { type: "answer"; id: string; value: string; correct: boolean }
  | { type: "operation"; id: string }
  | { type: "reduced-motion"; enabled: boolean }
  | { type: "dismiss-notice" }
  | { type: "notice"; notice: string }
  | { type: "tick"; deltaMs: number; generation: number; revision: number };

// These are teaching pauses, independent of who supplies a tool response.
const GUIDED_STAGES = new Set(["W01", "W03", "W06", "W07", "W09", "W10", "W12", "W13"]);
const TERMINAL_STATUSES = new Set(["success", "incomplete", "cancelled"]);
const SPEEDS: readonly number[] = [0.5, 1, 1.5, 2];

export function createPlayer(config: Partial<Config> & { runId?: string } = {}): PlayerState {
  return {
    run: createRun(config),
    phase: "paused",
    progress: 0,
    speed: 1,
    pace: "guided",
    resultMode: "auto",
    glossaryId: null,
    replaying: false,
    stepping: false,
    generation: 0,
    reducedMotion: false,
    learning: { visited: ["W00"], operations: [], answers: {} },
    notice: null,
  };
}

export function segmentDuration(state: PlayerState): number {
  // Weak motion changes presentation, but preserves the order and reading time.
  const stage = currentSnapshot(state.run).stage;
  return ["W03", "W04", "W05", "W08", "W09"].includes(stage) ? 2000 : 1600;
}

function markVisited(state: PlayerState, run: Run): LearningProgress {
  const stage = currentSnapshot(run).stage;
  return state.learning.visited.includes(stage)
    ? state.learning
    : { ...state.learning, visited: [...state.learning.visited, stage] };
}

function moveToRun(state: PlayerState, run: Run, phase: PlayerState["phase"] = "paused"): PlayerState {
  if (run === state.run) return state;
  return {
    ...state,
    run,
    phase,
    progress: 0,
    replaying: false,
    generation: state.generation + 1,
    learning: markVisited(state, run),
  };
}

function paused(state: PlayerState): PlayerState {
  return { ...state, phase: "paused", stepping: false, generation: state.generation + 1 };
}

function forward(state: PlayerState, phase: PlayerState["phase"]): PlayerState {
  const snapshot = currentSnapshot(state.run);
  // Traversing existing snapshots must not submit a second response.
  if (state.run.cursor < state.run.history.length - 1) {
    return moveToRun(state, advance(state.run, state.run.revision), phase);
  }
  if (snapshot.status === "waiting") {
    if (state.resultMode === "manual") return paused(state);
    // The simulator explicitly constructs and submits a response; advance alone
    // can never invent a tool result, including in automatic playback mode.
    const result = makeResult(state.run, "success");
    return moveToRun(state, submitResult(state.run, result, state.run.revision), phase);
  }
  if (TERMINAL_STATUSES.has(snapshot.status)) return paused(state);
  return moveToRun(state, advance(state.run, state.run.revision), phase);
}

export function playerReducer(state: PlayerState, action: PlayerAction): PlayerState {
  switch (action.type) {
    case "tick": {
      if (
        state.phase !== "playing" || action.generation !== state.generation ||
        action.revision !== state.run.revision || !Number.isFinite(action.deltaMs) || action.deltaMs <= 0
      ) return state;
      const progress = Math.min(1, state.progress + action.deltaMs * state.speed / segmentDuration(state));
      const progressed = { ...state, progress };
      if (progress < 1) return progressed;
      const snapshot = currentSnapshot(state.run);
      const waitingForHuman = snapshot.status === "waiting" && state.resultMode === "manual" &&
        state.run.cursor === state.run.history.length - 1;
      if (state.replaying || state.stepping || TERMINAL_STATUSES.has(snapshot.status) || waitingForHuman ||
        (state.pace === "guided" && GUIDED_STAGES.has(snapshot.stage) && snapshot.status !== "waiting")) {
        return { ...paused(progressed), replaying: false };
      }
      return forward(progressed, "playing");
    }
    case "play": {
      if (state.phase === "explaining") return state;
      let next = state;
      if (state.progress >= 1 && !state.replaying) next = forward(state, "playing");
      const snapshot = currentSnapshot(next.run);
      if (next.progress >= 1 && (TERMINAL_STATUSES.has(snapshot.status) ||
        (snapshot.status === "waiting" && next.resultMode === "manual"))) return paused(next);
      return { ...next, phase: "playing", stepping: false, generation: next.generation + 1 };
    }
    case "pause":
      return state.phase === "explaining" ? state : paused(state);
    case "next": {
      if (state.phase === "explaining") return state;
      const next = forward(state, "playing");
      return next.run === state.run ? paused(state) : { ...next, stepping: true };
    }
    case "back":
      return playerReducer(state, { type: "seek", index: state.run.cursor - 1 });
    case "seek": {
      if (state.phase === "explaining" || !Number.isInteger(action.index) || action.index < 0 ||
        action.index >= state.run.history.length) return state;
      const next = moveToRun(state, seekRun(state.run, action.index));
      return { ...paused(next), progress: 1, replaying: false };
    }
    case "replay":
      if (state.phase === "explaining") return state;
      return { ...state, phase: "playing", replaying: true, stepping: true, progress: 0, generation: state.generation + 1 };
    case "restart": {
      const next = createPlayer({ ...state.run.config, runId: action.runId });
      return {
        ...next,
        speed: state.speed, pace: state.pace, resultMode: state.resultMode, reducedMotion: state.reducedMotion,
        generation: state.generation + 1,
        learning: { ...state.learning, answers: {} },
      };
    }
    case "stop":
      return { ...paused(moveToRun(state, cancelRun(state.run))), glossaryId: null, replaying: false };
    case "speed":
      return SPEEDS.includes(action.speed) ? { ...state, speed: action.speed, generation: state.generation + 1 } : state;
    case "pace":
      return { ...state, pace: action.pace, generation: state.generation + 1 };
    case "result-mode":
      return { ...paused(state), resultMode: action.mode, glossaryId: null };
    case "open-glossary":
      return { ...state, phase: "explaining", glossaryId: action.id, generation: state.generation + 1 };
    case "close-glossary":
      return { ...paused(state), glossaryId: null };
    case "revise": {
      const run = reviseRun(state.run, action.config);
      if (run === state.run) return state;
      return {
        ...moveToRun(state, run), glossaryId: null, stepping: false,
        learning: { ...state.learning, answers: {} },
      };
    }
    case "submit": {
      if (state.phase === "explaining" || (action.expectedRunId !== undefined && action.expectedRunId !== state.run.id)) return state;
      const run = submitResult(state.run, action.result, action.expectedRevision ?? state.run.revision);
      const next = moveToRun(state, run, "playing");
      if (run === state.run) return state;
      return { ...next, stepping: state.pace === "guided", learning: {
        ...next.learning,
        answers: run.revision === state.run.revision ? next.learning.answers : {},
        operations: [...new Set([...next.learning.operations, `return:${currentSnapshot(state.run).stage}`])],
      } };
    }
    case "submit-preset":
      if (currentSnapshot(state.run).status !== "waiting") return state;
      return playerReducer(state, {
        type: "submit", result: makeResult(state.run, action.preset, action.value), expectedRevision: state.run.revision, expectedRunId: state.run.id,
      });
    case "answer":
      return { ...state, learning: { ...state.learning, answers: {
        ...state.learning.answers,
        [action.id]: { value: action.value, correct: action.correct, revision: state.run.revision, runId: state.run.id },
      } } };
    case "operation":
      return { ...state, learning: { ...state.learning, operations: [...new Set([...state.learning.operations, action.id])] } };
    case "reduced-motion":
      return { ...state, reducedMotion: action.enabled };
    case "dismiss-notice":
      return { ...state, notice: null };
    case "notice":
      return { ...state, notice: action.notice };
  }
}

export function serializePlayer(state: PlayerState): string {
  return JSON.stringify({
    namespace: "agent-lab/weather/player", version: PLAYER_VERSION,
    run: serializeRun(state.run),
    playback: { progress: state.progress, speed: state.speed, pace: state.pace, resultMode: state.resultMode,
      reducedMotion: state.reducedMotion, replaying: state.replaying },
  });
}

export function serializeLearning(learning: LearningProgress): string {
  return JSON.stringify({ namespace: "agent-lab/weather/learning", version: PLAYER_VERSION, learning });
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 1000 && value.every((entry) => typeof entry === "string" && entry.length <= 200);
}

export function restoreLearning(raw: string | null): { learning: LearningProgress; error: string | null } {
  const empty: LearningProgress = { visited: ["W00"], operations: [], answers: {} };
  if (!raw) return { learning: empty, error: null };
  try {
    const data: unknown = JSON.parse(raw);
    if (!object(data) || data.namespace !== "agent-lab/weather/learning" || data.version !== PLAYER_VERSION || !object(data.learning))
      throw new Error("学习记录版本不兼容。");
    const learning = data.learning;
    if (!stringList(learning.visited) || !stringList(learning.operations) || !object(learning.answers) ||
      Object.keys(learning.answers).length > 1000) throw new Error("学习记录格式无效。");
    const answers: Record<string, LearningAnswer> = {};
    for (const [id, answer] of Object.entries(learning.answers)) {
      if (id === "__proto__" || id === "constructor" || id === "prototype" || !object(answer) || typeof answer.value !== "string" ||
        answer.value.length > 10000 || typeof answer.correct !== "boolean" || !Number.isInteger(answer.revision) ||
        Number(answer.revision) < 0 || typeof answer.runId !== "string") throw new Error("理解检查记录格式无效。");
      answers[id] = answer as unknown as LearningAnswer;
    }
    return { learning: { visited: [...new Set(learning.visited)], operations: [...new Set(learning.operations)], answers }, error: null };
  } catch {
    return { learning: empty, error: "本地学习记录损坏或版本不兼容，已使用空白学习记录；可重置本课保存。" };
  }
}

export function restorePlayer(raw: string | null, learningRaw: string | null = null, fallback = createPlayer()): PlayerState {
  const learningResult = restoreLearning(learningRaw);
  const base = { ...fallback, phase: "paused" as const, glossaryId: null, learning: learningResult.learning };
  if (!raw) return { ...base, learning: { ...base.learning, answers: {} }, notice: learningResult.error };
  try {
    const data: unknown = JSON.parse(raw);
    if (!object(data) || data.namespace !== "agent-lab/weather/player" || data.version !== PLAYER_VERSION ||
      typeof data.run !== "string" || !object(data.playback)) throw new Error("播放记录格式无效。");
    const restored = restoreRun(data.run);
    const playback = data.playback;
    if (!restored.run || restored.error || typeof playback.progress !== "number" || !Number.isFinite(playback.progress) ||
      playback.progress < 0 || playback.progress > 1 || typeof playback.speed !== "number" || !SPEEDS.includes(playback.speed) ||
      !["guided", "continuous"].includes(String(playback.pace)) || !["auto", "manual"].includes(String(playback.resultMode)) ||
      typeof playback.reducedMotion !== "boolean" || typeof playback.replaying !== "boolean") throw new Error("播放记录不能恢复。");
    const run = restored.run;
    const answers = Object.fromEntries(Object.entries(base.learning.answers)
      .filter(([, answer]) => answer.revision === run.revision && answer.runId === run.id));
    return {
      ...base, run, progress: playback.progress, speed: playback.speed as PlaybackSpeed,
      pace: playback.pace as PlaybackPace, resultMode: playback.resultMode as ResultMode,
      reducedMotion: playback.reducedMotion, replaying: playback.replaying,
      learning: { ...base.learning, visited: [...new Set([...base.learning.visited, currentSnapshot(run).stage])], answers },
      notice: learningResult.error ?? "已恢复本课的位置与数据，当前暂停。点击播放后继续。",
    };
  } catch {
    return {
      ...base, learning: { ...base.learning, answers: {} },
      notice: "本地播放记录损坏或版本不兼容，已回到课程起点；可重置本课保存。",
    };
  }
}
