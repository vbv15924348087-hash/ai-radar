import { describe, expect, it } from "vitest";
import {
  advance, cancelRun, createRun, currentSnapshot, makeResult, restoreRun,
  reviseRun, seek, serializeRun, submitResult, validateTemperatureInput,
  type ResultPreset, type Run, type ToolResult,
} from "@/features/agent-lab/engine";

function waiting(run: Run): Run {
  for (let index = 0; index < 40; index += 1) {
    if (currentSnapshot(run).status === "waiting") return run;
    const next = advance(run);
    if (next === run) throw new Error(`没有进入等待状态：${currentSnapshot(run).stage}`);
    run = next;
  }
  throw new Error("流程未在有限步数内到达人工返回点。");
}

function finish(run: Run): Run {
  for (let index = 0; index < 45; index += 1) {
    const state = currentSnapshot(run);
    if (state.status === "success" || state.status === "incomplete") return run;
    run = state.status === "waiting" ? submitResult(run, makeResult(run)) : advance(run);
  }
  throw new Error("模拟未正常终止。");
}

function afterToday(difficulty: "A" | "B" | "C" = "B"): Run {
  const run = waiting(createRun({ difficulty }));
  return submitResult(run, makeResult(run));
}

describe("天气课：确定性状态与事实来源", () => {
  it("提出请求与实际发出分开，结果返回前不泄露天气事实", () => {
    let run = createRun();
    expect(currentSnapshot(run)).toMatchObject({ stage: "W00", facts: {}, attempts: { today: 0, yesterday: 0 } });
    run = advance(advance(advance(run)));
    expect(currentSnapshot(run)).toMatchObject({ stage: "W03", request: { status: "proposed" }, facts: {}, attempts: { today: 0 } });
    run = advance(run);
    expect(currentSnapshot(run)).toMatchObject({ stage: "W04", request: { status: "sent" }, facts: {}, attempts: { today: 1 } });
    expect(currentSnapshot(run).answer).toBeNull();
  });

  it("下一步在人工返回点永远不会偷偷提交默认结果", () => {
    const run = waiting(createRun());
    expect(currentSnapshot(run).stage).toBe("W05");
    for (let index = 0; index < 10; index += 1) expect(advance(run)).toBe(run);
    expect(currentSnapshot(run).facts).toEqual({});
    expect(currentSnapshot(run).lastResult).toBeNull();
    expect(currentSnapshot(run).attempts.today).toBe(1);
  });

  it("候选返回不改变状态，明确提交只接受当前请求一次", () => {
    const run = waiting(createRun());
    const payload = makeResult(run);
    expect(currentSnapshot(run).facts.today).toBeUndefined();
    const submitted = submitResult(run, payload);
    expect(currentSnapshot(submitted).stage).toBe("W06");
    expect(currentSnapshot(submitted).facts.today).toMatchObject({ value: 30, requestId: payload.requestId, date: "2026-09-05" });
    expect(submitResult(submitted, payload)).toBe(submitted);
    expect(currentSnapshot(submitted).facts.yesterday).toBeUndefined();
    expect(currentSnapshot(submitted).comparison).toBeNull();
  });

  it("A 只进行一次查询并在独立完成条件下结束", () => {
    const run = finish(createRun({ difficulty: "A" }));
    expect(currentSnapshot(run)).toMatchObject({ stage: "W12", status: "success", attempts: { today: 1, yesterday: 0 }, comparison: null });
    expect(currentSnapshot(run).facts.yesterday).toBeUndefined();
    expect(currentSnapshot(run).answer).toContain("一次查询已完成");
    expect(advance(run)).toBe(run);
  });

  it.each([[30, 22, 8, "高 8"], [18, 22, -4, "低 4"], [22, 22, 0, "相同"]])(
    "B 正确计算今天 %s、昨天 %s 的温差 %s",
    (today, yesterday, difference, description) => {
      const run = finish(createRun({ today: Number(today), yesterday: Number(yesterday) }));
      const state = currentSnapshot(run);
      expect(state.status).toBe("success");
      expect(state.comparison?.difference).toBe(difference);
      expect(state.comparison?.description).toContain(description);
      expect(state.comparison?.requestIds).toEqual([state.facts.today?.requestId, state.facts.yesterday?.requestId]);
      expect(state.attempts).toEqual({ today: 1, yesterday: 1 });
      expect(state.facts.today?.requestId).not.toBe(state.facts.yesterday?.requestId);
    },
  );

  it("建议依据今天的绝对气温与天气，不只依据温差", () => {
    const warm = currentSnapshot(finish(createRun({ today: 30, yesterday: 22, todayCondition: "晴" })));
    const cold = currentSnapshot(finish(createRun({ today: 8, yesterday: 0, todayCondition: "雨" })));
    expect(warm.comparison?.difference).toBe(cold.comparison?.difference);
    expect(warm.comparison?.advice).toContain("轻薄");
    expect(warm.comparison?.advice).toContain("遮阳");
    expect(cold.comparison?.advice).toContain("保暖");
    expect(cold.comparison?.advice).toContain("雨具");
  });

  it("小数温差避免二进制浮点尾数", () => {
    expect(currentSnapshot(finish(createRun({ today: 22.3, yesterday: 22.1 }))).comparison?.difference).toBe(0.2);
  });

  it("合法细小温差不会被三位小数舍入误判为气温相同", () => {
    const positive = currentSnapshot(finish(createRun({ today: 22.10001, yesterday: 22.1 })));
    const negative = currentSnapshot(finish(createRun({ today: 22.1, yesterday: 22.10001 })));
    expect(positive.comparison?.difference).toBe(0.00001);
    expect(positive.comparison?.description).toContain("高");
    expect(negative.comparison?.difference).toBe(-0.00001);
    expect(negative.comparison?.description).toContain("低");
  });
});

describe("天气课：返回关联、异常与有界重试", () => {
  it.each<ResultPreset>(["timeout", "wrong-date", "missing-value", "wrong-unit", "wrong-metric"])(
    "%s 不成为事实，失败本身不增加额外尝试", (preset) => {
      const run = waiting(afterToday("C"));
      const todayFact = currentSnapshot(run).facts.today;
      const failed = submitResult(run, makeResult(run, preset));
      expect(currentSnapshot(failed)).toMatchObject({ stage: "W13", status: "running", comparison: null, answer: null, attempts: { today: 1, yesterday: 1 } });
      expect(currentSnapshot(failed).facts.today).toEqual(todayFact);
      expect(currentSnapshot(failed).facts.yesterday).toBeUndefined();
      expect(currentSnapshot(failed).error).toBeTruthy();
    },
  );

  it.each([
    ["city", "北京", "城市"], ["date", "2026-09-03", "日期"],
    ["unit", "fahrenheit", "单位"], ["metric", "daily_low", "口径"],
    ["value", undefined, "缺少温度"], ["value", null, "缺少温度"],
    ["value", "", "温度无效"], ["value", "22", "温度无效"],
    ["value", Number.NaN, "温度无效"], ["value", Infinity, "温度无效"],
    ["value", 100, "温度无效"], ["condition", undefined, "天气状态"],
    ["condition", "", "天气状态"],
  ])("拒绝无效字段 %s=%s 并说明 %s", (key, value, message) => {
    const run = waiting(createRun({ difficulty: "C" }));
    const result = makeResult(run);
    result.data = { ...result.data, [key as string]: value };
    const failed = submitResult(run, result);
    expect(currentSnapshot(failed).facts).toEqual({});
    expect(currentSnapshot(failed).error).toContain(message);
  });

  it("请求 ID 不匹配不成为事实", () => {
    const run = waiting(createRun({ difficulty: "C" }));
    const failed = submitResult(run, { ...makeResult(run), requestId: "unknown-request" });
    expect(currentSnapshot(failed).facts).toEqual({});
    expect(currentSnapshot(failed).error).toContain("请求 ID");
  });

  it("缺少整个 data 也不能把 success 字符串当作成功", () => {
    const run = waiting(createRun());
    const failed = submitResult(run, { requestId: currentSnapshot(run).request!.id, status: "success" });
    expect(currentSnapshot(failed).status).toBe("running");
    expect(currentSnapshot(failed).error).toContain("缺少天气数据");
  });

  it("昨天第一次失败后只重试昨天，新 ID 返回成功后可完成", () => {
    const run = waiting(afterToday("C"));
    const originalRequest = currentSnapshot(run).request!;
    const todayFact = currentSnapshot(run).facts.today;
    const failed = submitResult(run, makeResult(run, "timeout"));
    const retry = waiting(failed);
    expect(currentSnapshot(retry).request!.id).not.toBe(originalRequest.id);
    expect(currentSnapshot(retry).request!.logicalQuery).toBe("yesterday");
    expect(currentSnapshot(retry).facts.today).toEqual(todayFact);
    expect(currentSnapshot(retry).attempts).toEqual({ today: 1, yesterday: 2 });
    const completed = finish(submitResult(retry, makeResult(retry)));
    expect(currentSnapshot(completed)).toMatchObject({ status: "success", comparison: { difference: 8 } });
  });

  it.each(["today", "yesterday"])("%s 连续两次失败后未完成停止，不产生温差或虚构成功", (query) => {
    let run = query === "today" ? waiting(createRun({ difficulty: "C" })) : waiting(afterToday("C"));
    run = submitResult(run, makeResult(run, "timeout"));
    run = waiting(run);
    run = submitResult(run, makeResult(run, "missing-value"));
    expect(currentSnapshot(run)).toMatchObject({ stage: "W13", status: "incomplete", comparison: null, answer: null });
    expect(currentSnapshot(run).stopReason).toContain("2 次");
    expect(advance(run)).toBe(run);
    expect(submitResult(run, makeResult(run))).toBe(run);
    expect(currentSnapshot(run).attempts[query as "today" | "yesterday"]).toBe(2);
  });

  it("旧请求的迟到结果不污染重试中的新请求", () => {
    const run = waiting(createRun({ difficulty: "C" }));
    const old = makeResult(run);
    const retry = waiting(submitResult(run, makeResult(run, "timeout")));
    expect(submitResult(retry, old)).toBe(retry);
  });

  it("表单空值与非法数值不产生查询尝试；零值合法", () => {
    const run = createRun();
    for (const value of ["", " ", "invalid", undefined, null, Infinity, NaN, 70]) expect(validateTemperatureInput(value).error).toBeTruthy();
    expect(validateTemperatureInput("0")).toEqual({ value: 0, error: null });
    expect(validateTemperatureInput("18.5")).toEqual({ value: 18.5, error: null });
    expect(currentSnapshot(run).attempts).toEqual({ today: 0, yesterday: 0 });
    expect(() => createRun({ today: NaN })).toThrow();
    expect(() => reviseRun(run, { yesterday: Infinity })).toThrow();
  });
});

describe("天气课：回放、分支、旧回调与持久化", () => {
  it("回退到已访问步骤，前进仅恢复快照，不重复请求与提交", () => {
    const completed = finish(createRun());
    let replay = seek(completed, 0);
    for (let index = 1; index < completed.history.length; index += 1) {
      replay = advance(replay);
      expect(currentSnapshot(replay)).toEqual(completed.history[index]);
      expect(replay.history).toBe(completed.history);
    }
    expect(currentSnapshot(replay).attempts).toEqual({ today: 1, yesterday: 1 });
    expect(seek(replay, 999)).toBe(replay);
    expect(seek(replay, -1)).toBe(replay);
  });

  it("修改昨天仅保留今天及其来源，丢弃昨天与旧答案；新分支可完成", () => {
    const completed = finish(createRun());
    const revised = reviseRun(completed, { yesterday: 35 });
    expect(revised.revision).toBe(completed.revision + 1);
    expect(currentSnapshot(revised)).toMatchObject({ stage: "W07", facts: { today: currentSnapshot(completed).facts.today }, comparison: null, answer: null });
    expect(currentSnapshot(revised).facts.yesterday).toBeUndefined();
    expect(revised.history.length).toBeLessThan(completed.history.length);
    const rerun = finish(revised);
    expect(currentSnapshot(rerun).comparison?.difference).toBe(-5);
    expect(currentSnapshot(rerun).facts.yesterday?.requestId).toContain(":r1:");
    expect(restoreRun(serializeRun(rerun)).run).toEqual(rerun);
  });

  it("修改今天使两日事实和计算失效，旧修订回调被拒绝", () => {
    const original = waiting(createRun());
    const payload = makeResult(original);
    const revised = reviseRun(original, { today: 18 });
    expect(currentSnapshot(revised)).toMatchObject({ stage: "W02", facts: {}, comparison: null, attempts: { today: 0, yesterday: 0 } });
    expect(advance(revised, original.revision)).toBe(revised);
    expect(submitResult(revised, payload, original.revision)).toBe(revised);
    const newWait = waiting(revised);
    expect(currentSnapshot(newWait).request?.id).not.toBe(payload.requestId);
    expect(currentSnapshot(finish(newWait)).comparison?.difference).toBe(-4);
  });

  it("被修订截掉的旧请求即使未传修订参数也不会污染新请求", () => {
    const original = waiting(createRun());
    const payload = makeResult(original);
    const newWait = waiting(reviseRun(original, { today: 18 }));
    expect(newWait.history.some((s) => s.request?.id === payload.requestId)).toBe(false);
    expect(submitResult(newWait, payload)).toBe(newWait);
    expect(currentSnapshot(newWait).error).toBeNull();
    expect(currentSnapshot(newWait).attempts.today).toBe(1);
  });

  it("已访问等待位置重新提交创建新修订并删除旧未来", () => {
    const completed = finish(createRun());
    const index = completed.history.findIndex((s) => s.stage === "W09" && s.status === "waiting");
    const past = seek(completed, index);
    const branch = submitResult(past, makeResult(past, "success", 40));
    expect(branch.revision).toBe(completed.revision + 1);
    expect(branch.history.length).toBe(index + 2);
    expect(currentSnapshot(branch).answer).toBeNull();
    const rerun = finish(branch);
    expect(currentSnapshot(rerun).comparison?.difference).toBe(-10);
    expect(restoreRun(serializeRun(rerun)).run).toEqual(rerun);
  });

  it("难度改变建立新的任务起点", () => {
    const changed = reviseRun(finish(createRun()), { difficulty: "A" });
    expect(changed.history).toHaveLength(1);
    expect(currentSnapshot(changed)).toMatchObject({ stage: "W00", status: "idle", facts: {} });
    expect(restoreRun(serializeRun(changed)).run).toEqual(changed);
    expect(currentSnapshot(finish(changed)).attempts.yesterday).toBe(0);
  });

  it("用户停止取消待执行事件，保留可恢复的历史而不生成答案", () => {
    const run = waiting(createRun());
    const cancelled = cancelRun(run);
    expect(currentSnapshot(cancelled)).toMatchObject({ status: "cancelled", answer: null });
    expect(cancelled.revision).toBe(run.revision + 1);
    expect(advance(cancelled)).toBe(cancelled);
    expect(submitResult(cancelled, makeResult(run), run.revision)).toBe(cancelled);
    expect(restoreRun(serializeRun(cancelled)).run).toEqual(cancelled);
  });

  it("取消后可恢复、回到等待位置重交结果，并再次恢复新分支", () => {
    const waitingYesterday = waiting(afterToday("C"));
    const cancelled = cancelRun(waitingYesterday);
    const restored = restoreRun(serializeRun(cancelled)).run!;
    const past = seek(restored, restored.cursor - 1);
    const rerun = finish(submitResult(past, makeResult(past, "success", 28)));
    expect(currentSnapshot(rerun)).toMatchObject({ status: "success", comparison: { difference: 2 } });
    expect(rerun.revision).toBe(cancelled.revision + 1);
    expect(restoreRun(serializeRun(rerun)).run).toEqual(rerun);
  });

  it("取消后修改条件只保留安全前缀，重新发出的 ID 可追溯", () => {
    const cancelled = cancelRun(waiting(afterToday("C")));
    const revised = reviseRun(cancelled, { yesterday: 32 });
    const next = waiting(revised);
    expect(currentSnapshot(next).request?.id).toContain(`:r${revised.revision}:yesterday:attempt1`);
    expect(currentSnapshot(next).facts.today).toEqual(currentSnapshot(cancelled).facts.today);
    expect(restoreRun(serializeRun(next)).run).toEqual(next);
    expect(currentSnapshot(finish(next)).comparison?.difference).toBe(-2);
  });

  it("每个播放位置可序列化；恢复时不推进或提交", () => {
    const completed = finish(createRun());
    for (let index = 0; index < completed.history.length; index += 1) {
      const run = seek(completed, index);
      const restored = restoreRun(serializeRun(run));
      expect(restored.error).toBeNull();
      expect(restored.run).toEqual(run);
      expect(currentSnapshot(restored.run!)).toEqual(completed.history[index]);
    }
    const wait = waiting(createRun());
    expect(currentSnapshot(restoreRun(serializeRun(wait)).run!).facts).toEqual({});
  });

  it("异常与终止历史也能恢复", () => {
    let run = waiting(afterToday("C"));
    run = submitResult(run, makeResult(run, "wrong-date"));
    run = waiting(run);
    run = submitResult(run, makeResult(run, "timeout"));
    expect(restoreRun(serializeRun(run)).run).toEqual(run);
  });

  it.each([NaN, Infinity, -Infinity])("非法数值 %s 的异常历史恢复后仍保持相同原因", (value) => {
    const run = waiting(createRun({ difficulty: "C" }));
    const payload = makeResult(run);
    payload.data!.value = value;
    const failed = submitResult(run, payload);
    expect(currentSnapshot(failed).error).toContain("温度无效");
    expect(restoreRun(serializeRun(failed)).run).toEqual(failed);
  });

  it.each(["{", "null", "[]", JSON.stringify({ namespace: "agent-lab.weather.run", version: 0 })])("损坏或旧版状态 %s 提供错误信息", (saved) => {
    const restored = restoreRun(saved);
    expect(restored.run).toBeNull();
    expect(restored.error).toBeTruthy();
  });

  it("恢复会验证事件，而非盲信被修改的事实或成功标识", () => {
    const run = finish(createRun());
    const corrupted = JSON.parse(serializeRun(run));
    corrupted.run.history[5].facts.today = { value: 99 };
    expect(restoreRun(JSON.stringify(corrupted)).run).toBeNull();
    const fakeSuccess = JSON.parse(serializeRun(waiting(createRun())));
    fakeSuccess.run.history.at(-1).status = "success";
    expect(restoreRun(JSON.stringify(fakeSuccess)).run).toBeNull();
  });

  it("纯转换不修改旧运行或调用方的候选数据", () => {
    const run = waiting(createRun());
    const saved = serializeRun(run);
    const payload: ToolResult = makeResult(run);
    const next = submitResult(run, payload);
    payload.data!.value = 50;
    expect(serializeRun(run)).toBe(saved);
    expect(currentSnapshot(next).facts.today?.value).toBe(30);
    expect(currentSnapshot(next).lastResult?.data?.value).toBe(30);
  });
});
