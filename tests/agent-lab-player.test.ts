import { describe, expect, it } from "vitest";
import { currentSnapshot, makeResult } from "@/features/agent-lab/engine";
import {
  createPlayer, playerReducer, restoreLearning, restorePlayer, segmentDuration,
  serializeLearning, serializePlayer, type PlayerState,
} from "@/features/agent-lab/player";

function tick(state: PlayerState, fraction = 1): PlayerState {
  return playerReducer(state, { type: "tick", deltaMs: segmentDuration(state) * fraction,
    generation: state.generation, revision: state.run.revision });
}

function until(state: PlayerState, predicate: (state: PlayerState) => boolean): PlayerState {
  for (let index = 0; index < 50; index += 1) {
    if (predicate(state)) return state;
    state = playerReducer(state, { type: "next" });
  }
  throw new Error("教学状态未在预期步数内到达。");
}

function waitingToday(): PlayerState {
  return until(createPlayer({ runId: "test-weather" }), (state) => currentSnapshot(state.run).status === "waiting");
}

describe("weather lesson playback controls", () => {
  it("freezes a partial segment and tool state while paused, then resumes the exact fraction", () => {
    let state = playerReducer(createPlayer(), { type: "play" });
    state = tick(state, 0.35);
    expect(state.progress).toBeCloseTo(0.35);
    const frameBeforePause = { type: "tick" as const, deltaMs: 5000, generation: state.generation, revision: state.run.revision };
    state = playerReducer(state, { type: "pause" });
    const frozen = state;
    expect(playerReducer(state, frameBeforePause)).toBe(frozen);
    expect(tick(state, 3)).toBe(frozen);
    state = playerReducer(state, { type: "play" });
    state = tick(state, 0.2);
    expect(state.progress).toBeCloseTo(0.55);
    expect(state.run).toBe(frozen.run);
  });

  it("pauses at a key concept in guided mode and does not reset data when pace changes", () => {
    let state = playerReducer(createPlayer(), { type: "play" });
    state = tick(state);
    expect(currentSnapshot(state.run).stage).toBe("W01");
    state = tick(state);
    expect(state.phase).toBe("paused");
    const run = state.run;
    state = playerReducer(state, { type: "pace", pace: "continuous" });
    expect(state.run).toBe(run);
    expect(state.progress).toBe(1);
  });

  it("keeps continuous playback and human response independent; next cannot invent facts", () => {
    let state = waitingToday();
    state = playerReducer(state, { type: "result-mode", mode: "manual" });
    state = playerReducer(state, { type: "pace", pace: "continuous" });
    const waitingRun = state.run;
    for (let index = 0; index < 4; index += 1) state = playerReducer(state, { type: "next" });
    expect(state.run).toBe(waitingRun);
    expect(currentSnapshot(state.run).facts).toEqual({});
    state = playerReducer(state, { type: "play" });
    state = tick(state);
    expect(state.phase).toBe("paused");
    expect(state.run).toBe(waitingRun);
    state = playerReducer(state, { type: "submit-preset", preset: "success", value: 18 });
    expect(currentSnapshot(state.run).facts.today?.value).toBe(18);
  });

  it("completes the B task with explicitly generated automatic responses in continuous playback", () => {
    let state = playerReducer(createPlayer({ today: 18, yesterday: 22 }), { type: "pace", pace: "continuous" });
    state = playerReducer(state, { type: "play" });
    for (let index = 0; index < 30 && state.phase === "playing"; index += 1) state = tick(state);
    expect(currentSnapshot(state.run).status).toBe("success");
    expect(currentSnapshot(state.run).comparison?.difference).toBe(-4);
    expect(currentSnapshot(state.run).attempts).toEqual({ today: 1, yesterday: 1 });
    expect(state.phase).toBe("paused");
  });

  it("continues after an explicit human response but pauses for the next unanswered request", () => {
    let state = playerReducer(waitingToday(), { type: "result-mode", mode: "manual" });
    state = playerReducer(state, { type: "pace", pace: "continuous" });
    state = playerReducer(state, { type: "submit-preset", preset: "success", value: 18 });
    for (let index = 0; index < 10 && state.phase === "playing"; index += 1) state = tick(state);
    expect(currentSnapshot(state.run).stage).toBe("W09");
    expect(currentSnapshot(state.run).status).toBe("waiting");
    expect(currentSnapshot(state.run).facts.today?.value).toBe(18);
    expect(currentSnapshot(state.run).facts.yesterday).toBeUndefined();
    expect(state.phase).toBe("paused");
  });

  it("commits a rapid repeated manual submission only once", () => {
    let state = waitingToday();
    const submit = { type: "submit" as const, result: makeResult(state.run), expectedRunId: state.run.id, expectedRevision: state.run.revision };
    state = playerReducer(state, submit);
    const once = state;
    state = playerReducer(state, submit);
    expect(state).toBe(once);
    expect(currentSnapshot(state.run).attempts.today).toBe(1);
    expect(state.run.history.filter(snapshot => snapshot.event.type === "result")).toHaveLength(1);
  });

  it("single step finishes only its segment and a visual replay does not submit or count attempts", () => {
    let state = waitingToday();
    const run = state.run;
    state = playerReducer(state, { type: "replay" });
    state = tick(state);
    expect(state.phase).toBe("paused");
    expect(state.run).toBe(run);
    expect(currentSnapshot(state.run).facts.today).toBeUndefined();
    state = playerReducer(state, { type: "next" });
    expect(currentSnapshot(state.run).stage).toBe("W06");
    const submittedRun = state.run;
    state = tick(state);
    expect(state.phase).toBe("paused");
    expect(state.run).toBe(submittedRun);
  });

  it("opens and closes an explanation at the same paused subevent with no autoplay", () => {
    let state = playerReducer(createPlayer(), { type: "next" });
    state = tick(state, 0.42);
    const before = state;
    state = playerReducer(state, { type: "open-glossary", id: "parameters" });
    expect(state.phase).toBe("explaining");
    expect(tick(state)).toBe(state);
    expect(playerReducer(state, { type: "next" })).toBe(state);
    state = playerReducer(state, { type: "close-glossary" });
    expect(state.phase).toBe("paused");
    expect(state.progress).toBe(before.progress);
    expect(state.run).toBe(before.run);
    expect(state.glossaryId).toBeNull();
  });

  it("revisits snapshots without duplicate queries and rejects seeking unseen future states", () => {
    let state = until(createPlayer(), (value) => currentSnapshot(value.run).status === "success");
    const finalRun = state.run;
    state = playerReducer(state, { type: "seek", index: 5 });
    expect(currentSnapshot(state.run).status).toBe("waiting");
    expect(currentSnapshot(state.run).facts.today).toBeUndefined();
    state = playerReducer(state, { type: "result-mode", mode: "manual" });
    state = until(state, (value) => currentSnapshot(value.run).status === "success");
    expect(state.run.history).toEqual(finalRun.history);
    expect(currentSnapshot(state.run).attempts).toEqual({ today: 1, yesterday: 1 });
    expect(playerReducer(state, { type: "seek", index: 999 })).toBe(state);
    expect(playerReducer(state, { type: "seek", index: -1 })).toBe(state);
  });

  it("invalidates downstream answers and callbacks when upstream inputs or the run change", () => {
    let state = waitingToday();
    state = playerReducer(state, { type: "answer", id: "actor", value: "application", correct: true });
    const staleTick = { type: "tick" as const, generation: state.generation, revision: state.run.revision, deltaMs: 10000 };
    const staleResult = { type: "submit" as const, result: makeResult(state.run), expectedRevision: state.run.revision, expectedRunId: state.run.id };
    const visited = state.learning.visited;
    state = playerReducer(state, { type: "revise", config: { today: 18 } });
    expect(state.run.revision).toBe(1);
    expect(state.learning.answers).toEqual({});
    expect(state.learning.visited).toEqual(visited);
    expect(currentSnapshot(state.run).facts).toEqual({});
    expect(playerReducer(state, staleTick)).toBe(state);
    expect(playerReducer(state, staleResult)).toBe(state);
    state = playerReducer(state, { type: "restart", runId: "test-new-run" });
    state = until(state, (value) => currentSnapshot(value.run).status === "waiting");
    expect(state.run.revision).toBe(0);
    expect(playerReducer(state, staleResult)).toBe(state);
    expect(playerReducer(state, staleTick)).toBe(state);
  });

  it("allows an explicit changed response at a visited wait to replace dependent history and answers", () => {
    let state = until(createPlayer(), (value) => currentSnapshot(value.run).status === "success");
    state = playerReducer(state, { type: "answer", id: "difference", value: "+8", correct: true });
    const oldLength = state.run.history.length;
    state = playerReducer(state, { type: "seek", index: 5 });
    state = playerReducer(state, { type: "submit-preset", preset: "success", value: 18 });
    expect(state.run.revision).toBe(1);
    expect(state.run.history.length).toBeLessThan(oldLength);
    expect(currentSnapshot(state.run).facts.today?.value).toBe(18);
    expect(state.learning.answers).toEqual({});
    state = until(state, (value) => currentSnapshot(value.run).status === "success");
    expect(currentSnapshot(state.run).comparison?.difference).toBe(-4);
  });

  it("does not accept a late animation tick after a speed change or a stop", () => {
    let state = playerReducer(createPlayer(), { type: "play" });
    const oldTick = { type: "tick" as const, generation: state.generation, revision: state.run.revision, deltaMs: 1600 };
    state = playerReducer(state, { type: "speed", speed: 2 });
    expect(playerReducer(state, oldTick)).toBe(state);
    state = tick(state, 0.25);
    expect(state.progress).toBe(0.5);
    state = playerReducer(state, { type: "stop" });
    expect(currentSnapshot(state.run).status).toBe("cancelled");
    expect(state.phase).toBe("paused");
    expect(playerReducer(state, oldTick)).toBe(state);
    expect(playerReducer(state, { type: "next" }).run).toBe(state.run);
  });
});

describe("weather lesson persistence", () => {
  it("restores the exact partial position and facts, paused, with independently saved learning", () => {
    let state = waitingToday();
    state = playerReducer(state, { type: "submit-preset", preset: "success" });
    state = tick(state, 0.35);
    state = playerReducer(state, { type: "answer", id: "source", value: "tool", correct: true });
    const playerRaw = serializePlayer(state);
    expect(playerRaw).not.toContain('"answers"');
    const restored = restorePlayer(playerRaw, serializeLearning(state.learning));
    expect(restored.phase).toBe("paused");
    expect(restored.progress).toBeCloseTo(0.35);
    expect(restored.run).toEqual(state.run);
    expect(restored.learning.answers.source.correct).toBe(true);
    expect(restored.notice).toContain("已恢复");
    expect(tick(restored)).toBe(restored);
  });

  it("preserves a visual-only replay across restore without making a second result", () => {
    let state = playerReducer(waitingToday(), { type: "replay" });
    state = tick(state, 0.25);
    state = restorePlayer(serializePlayer(state));
    expect(state.replaying).toBe(true);
    const run = state.run;
    state = playerReducer(state, { type: "play" });
    state = tick(state);
    expect(state.run).toBe(run);
    expect(state.phase).toBe("paused");
  });

  it.each(["{", "null", "[]", '{"version": 999}', '{"namespace":"wrong","version":1}'])
    ("recovers safely from invalid persisted player data %s", (raw) => {
      const state = restorePlayer(raw);
      expect(state.phase).toBe("paused");
      expect(currentSnapshot(state.run).stage).toBe("W00");
      expect(state.notice).toContain("重置");
    });

  it("rejects invalid playback progress and incompatible learning without losing valid run data", () => {
    const state = waitingToday();
    const corrupt = JSON.parse(serializePlayer(state));
    corrupt.playback.progress = 5;
    expect(restorePlayer(JSON.stringify(corrupt)).notice).toContain("损坏");
    const restored = restorePlayer(serializePlayer(state), '{"version":999}');
    expect(restored.run).toEqual(state.run);
    expect(restored.learning.answers).toEqual({});
    expect(restored.notice).toContain("学习记录");
    expect(restoreLearning('{"namespace":"agent-lab/weather/learning","version":1,"learning":{}}').error).toBeTruthy();
  });

  it("drops stale answers saved for another run without dropping learned operations", () => {
    let old = playerReducer(createPlayer({ runId: "old" }), { type: "answer", id: "source", value: "tool", correct: true });
    old = playerReducer(old, { type: "operation", id: "edit-parameter" });
    const restored = restorePlayer(serializePlayer(createPlayer({ runId: "new" })), serializeLearning(old.learning));
    expect(restored.learning.answers).toEqual({});
    expect(restored.learning.operations).toEqual(["edit-parameter"]);
  });
});
