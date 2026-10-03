import { describe, expect, it } from "vitest";
import {
  formatSourceRef,
  getGlossaryTerm,
  GLOSSARY,
  LESSONS,
  MODULES,
  SOURCES,
  WEATHER_GLOSSARY_IDS,
  type SourceRef,
} from "@/features/agent-lab/curriculum";

const lessonIds = new Set(LESSONS.map((lesson) => lesson.id));

function checkSource(ref: SourceRef) {
  const entry = SOURCES[ref.sourceId];
  expect(entry, `未知来源 ${ref.sourceId}`).toBeDefined();
  if (ref.pdfPage !== undefined) {
    expect(Number.isInteger(ref.pdfPage)).toBe(true);
    expect(ref.pdfPage).toBeGreaterThan(0);
    expect(entry.pageCount, `不能为未读来源 ${entry.id} 编造页码`).toBeDefined();
    expect(ref.pdfPage).toBeLessThanOrEqual(entry.pageCount!);
  }
  if (ref.timeStart) expect(ref.timeStart).toMatch(/^\d{2,3}:\d{2}$/);
  if (ref.timeEnd) {
    expect(ref.timeStart, "结束时间需要对应开始时间").toBeDefined();
    const seconds = (value: string) => value.split(":").reduce((minutes, current) => minutes * 60 + Number(current), 0);
    expect(seconds(ref.timeEnd)).toBeGreaterThanOrEqual(seconds(ref.timeStart!));
  }
}

describe("Agent 课程内容与来源完整性", () => {
  it("八章课程 ID 唯一，专题中的引用均指向实际登记课程", () => {
    expect(LESSONS.map((entry) => entry.id)).toEqual(["L01", "L02", "L03", "L04", "L05", "L06", "L07", "L08"]);
    expect(lessonIds.size).toBe(LESSONS.length);
    for (const module of MODULES) for (const id of module.lessonIds) expect(lessonIds.has(id)).toBe(true);
    for (const lesson of LESSONS) {
      expect(lesson.sourceRefs.length).toBeGreaterThan(0);
      lesson.sourceRefs.forEach(checkSource);
      expect(lesson.title.length).toBeGreaterThan(0);
      expect(lesson.goal.length).toBeGreaterThan(0);
    }
  });

  it("只给天气样板已实现内容分配可打开路径，蓝图不指向空课程", () => {
    expect(LESSONS.filter((lesson) => lesson.implemented).map((lesson) => lesson.id)).toEqual(["L03", "L04"]);
    for (const lesson of LESSONS) {
      if (lesson.implemented) expect(lesson.route).toBe("/agent-lab/weather");
      else expect(lesson.route).toBeUndefined();
    }
  });

  it("术语 ID 不重复，引用的章节、页码、时间有效，缺失资料不被标成确认知识", () => {
    expect(new Set(GLOSSARY.map((entry) => entry.id)).size).toBe(GLOSSARY.length);
    for (const entry of GLOSSARY) {
      expect(entry.lessonIds.length, entry.id).toBeGreaterThan(0);
      expect(entry.sourceRefs.length, entry.id).toBeGreaterThan(0);
      entry.lessonIds.forEach((id) => expect(lessonIds.has(id), `${entry.id} 的章节 ${id} 不存在`).toBe(true));
      entry.sourceRefs.forEach(checkSource);
      if (entry.sourceRefs.some((ref) => SOURCES[ref.sourceId].status === "missing")) {
        expect(entry.evidenceKind).toBe("needs-review");
        expect(entry.status).toBe("资料不足");
      }
      expect(getGlossaryTerm(entry.id)).toEqual(entry);
    }
    expect(getGlossaryTerm("不存在的术语")).toBeUndefined();
  });

  it("规格中要求的全部深入术语均被登记，包含不能擅自补定义的名称", () => {
    const required = ["prompt", "system-prompt", "user-prompt", "llm", "response", "goal", "profile", "planning", "action", "observation", "environment", "loop", "react", "cot", "plan-and-execute", "planner", "executor", "replan", "reflection", "reflexion", "self-critics", "subgoal-decomposition", "context", "token", "vector", "vectorization", "corpus", "semantics", "short-term-memory", "long-term-memory", "episodic-memory", "semantic-memory", "procedural-memory", "tool", "api", "function", "parameter", "json", "json-schema", "function-calling", "mcp", "harness", "workflow", "skill", "icl", "tool-learning", "multi-agent"];
    for (const id of required) expect(getGlossaryTerm(id), id).toBeDefined();
    for (const id of WEATHER_GLOSSARY_IDS) expect(getGlossaryTerm(id), id).toBeDefined();
    for (const id of ["reflexion", "self-critics", "json-schema", "icl", "tool-learning", "multi-agent"]) {
      expect(getGlossaryTerm(id)?.status).toBe("资料不足");
    }
  });

  it("来源展示使用真实文件名和定位信息，明确保留 S3 缺失状态", () => {
    expect(SOURCES.S1.pageCount).toBe(20);
    expect(SOURCES.S2.pageCount).toBe(12);
    expect(SOURCES.S3.status).toBe("missing");
    expect(SOURCES.S3.pageCount).toBeUndefined();
    expect(formatSourceRef({ sourceId: "S2", pdfPage: 3, timeStart: "11:58", timeEnd: "14:48" }))
      .toBe("原文_AI Agent规划与记忆机制培训.pdf · PDF 第 3 页 · 11:58–14:48");
    expect(formatSourceRef({ sourceId: "S3" })).toContain("资料缺失，未读取");
    expect(formatSourceRef({ sourceId: "SPEC", section: "6.5" })).toContain("6.5");
  });

  it("争议与课堂类比保持显式状态，不因进入词典而变成确定事实", () => {
    for (const id of ["short-term-memory", "long-term-memory", "skill", "function"]) {
      expect(getGlossaryTerm(id)?.evidenceKind).toBe("needs-review");
    }
    for (const id of ["token", "vector", "mcp", "workflow"]) {
      expect(getGlossaryTerm(id)?.evidenceKind).toBe("source-analogy");
    }
    for (const id of ["parameter", "tool-description", "function-calling", "finish"]) {
      expect(getGlossaryTerm(id)?.evidenceKind).toBe("teaching-design");
    }
  });
});
