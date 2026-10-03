"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { currentSnapshot, type Config, type ResultPreset, type ToolResult } from "./engine";
import {
  createPlayer, LEARNING_STORAGE_KEY, PLAYER_STORAGE_KEY, playerReducer, restorePlayer,
  serializeLearning, serializePlayer,
  type PlaybackPace, type PlaybackSpeed, type PlayerAction, type PlayerState, type ResultMode,
} from "./player";

function newRunId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `weather-${crypto.randomUUID()}`
    : `weather-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useWeatherPlayer() {
  // Deterministic first render keeps Next's server output and hydration aligned.
  const [state, setState] = useState(() => createPlayer({ runId: "weather-initial" }));
  const [hydrated, setHydrated] = useState(false);
  const stateRef = useRef(state);
  const readyRef = useRef(false);

  const save = useCallback((value: PlayerState) => {
    if (!readyRef.current) return;
    try {
      localStorage.setItem(PLAYER_STORAGE_KEY, serializePlayer(value));
      localStorage.setItem(LEARNING_STORAGE_KEY, serializeLearning(value.learning));
    } catch {
      const next = { ...stateRef.current, notice: "浏览器暂时无法保存本课进度，当前页面仍可继续学习。" };
      stateRef.current = next;
      setState(next);
    }
  }, []);

  const dispatch = useCallback((action: PlayerAction) => {
    const before = stateRef.current;
    const next = playerReducer(before, action);
    if (next === before) return;
    stateRef.current = next;
    setState(next);
    // Frames stay in memory. Commit, pause and pagehide are the persistence boundaries.
    if (action.type !== "tick" || next.run !== before.run || next.phase !== before.phase) save(next);
  }, [save]);

  useEffect(() => {
    if (!readyRef.current) {
      let restored = createPlayer({ runId: newRunId() });
      try {
        const raw = localStorage.getItem(PLAYER_STORAGE_KEY);
        restored = restorePlayer(raw, localStorage.getItem(LEARNING_STORAGE_KEY), restored);
        if (!raw) restored.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      } catch {
        restored.notice = "浏览器暂时无法读取本课保存，已从课程起点开始。";
      }
      stateRef.current = restored;
      setState(restored);
      readyRef.current = true;
      setHydrated(true);
    }
    const onPageHide = () => {
      const next = playerReducer(stateRef.current, { type: "pause" });
      stateRef.current = next;
      setState(next);
      save(next);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") onPageHide();
    };
    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      save(stateRef.current);
    };
  }, [save]);

  useEffect(() => {
    if (!hydrated || state.phase !== "playing") return;
    const generation = state.generation;
    const revision = state.run.revision;
    let lastTime: number | null = null;
    let frame = 0;
    let cancelled = false;
    const tick = (time: number) => {
      if (cancelled) return;
      if (lastTime !== null) dispatch({ type: "tick", deltaMs: Math.min(250, Math.max(0, time - lastTime)), generation, revision });
      lastTime = time;
      if (stateRef.current.phase === "playing" && stateRef.current.generation === generation) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [hydrated, state.phase, state.generation, state.run.revision, dispatch]);

  const resetSaved = useCallback(() => {
    const next = createPlayer({ runId: newRunId() });
    next.generation = stateRef.current.generation + 1;
    next.reducedMotion = stateRef.current.reducedMotion;
    next.notice = "已重置本课的模拟运行与学习记录。";
    stateRef.current = next;
    setState(next);
    try {
      localStorage.removeItem(PLAYER_STORAGE_KEY);
      localStorage.removeItem(LEARNING_STORAGE_KEY);
    } catch {
      next.notice = "当前课程已重置，但浏览器无法清理本地保存。";
    }
    save(next);
  }, [save]);

  return {
    state, hydrated, run: state.run, snapshot: currentSnapshot(state.run),
    playing: state.phase === "playing", progress: state.progress, speed: state.speed,
    pace: state.pace, resultMode: state.resultMode, glossaryId: state.glossaryId,
    learning: state.learning, notice: state.notice, reducedMotion: state.reducedMotion,
    canBack: state.run.cursor > 0,
    play: () => dispatch({ type: "play" }),
    pause: () => dispatch({ type: "pause" }),
    next: () => dispatch({ type: "next" }),
    back: () => dispatch({ type: "back" }),
    seek: (index: number) => dispatch({ type: "seek", index }),
    replay: () => dispatch({ type: "replay" }),
    restart: () => dispatch({ type: "restart", runId: newRunId() }),
    stop: () => dispatch({ type: "stop" }),
    setSpeed: (speed: PlaybackSpeed) => dispatch({ type: "speed", speed }),
    setPace: (pace: PlaybackPace) => dispatch({ type: "pace", pace }),
    setResultMode: (mode: ResultMode) => dispatch({ type: "result-mode", mode }),
    openGlossary: (id: string) => dispatch({ type: "open-glossary", id }),
    closeGlossary: () => dispatch({ type: "close-glossary" }),
    revise: (config: Partial<Config>) => dispatch({ type: "revise", config }),
    submit: (result: ToolResult) => dispatch({ type: "submit", result, expectedRunId: state.run.id, expectedRevision: state.run.revision }),
    submitPreset: (preset: ResultPreset, value?: number) => dispatch({ type: "submit-preset", preset, value }),
    answer: (id: string, value: string, correct: boolean) => dispatch({ type: "answer", id, value, correct }),
    recordOperation: (id: string) => dispatch({ type: "operation", id }),
    dismissNotice: () => dispatch({ type: "dismiss-notice" }),
    setReducedMotion: (enabled: boolean) => dispatch({ type: "reduced-motion", enabled }),
    resetSaved,
  };
}
