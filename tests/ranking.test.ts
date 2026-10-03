import { describe, expect, it } from "vitest";
import { calculateFinalScore, matchTopics, MUST_READ_THRESHOLD, RELEVANT_THRESHOLD, WORTH_READ_THRESHOLD } from "@/domain/ranking";
import type { Topic } from "@/domain/topic";

const topics: Topic[] = [
  { id: "agent", name: "智能体", description: "Agent", keywords: ["Agent", "tool calling"], weight: 1 },
  { id: "memory", name: "记忆", description: "Memory", keywords: ["memory", "记忆"], weight: 1.5 },
];

describe("ranking domain", () => {
  it("uses the declared 40/30/20/10 weighting independent of UI", () => {
    expect(calculateFinalScore({ relevanceScore: 100, importanceScore: 50, noveltyScore: 25, sourceQualityScore: 80 })).toBe(68);
    expect(calculateFinalScore({ relevanceScore: 0, importanceScore: 0, noveltyScore: 0, sourceQualityScore: 0 })).toBe(0);
    expect(calculateFinalScore({ relevanceScore: 100, importanceScore: 100, noveltyScore: 100, sourceQualityScore: 100 })).toBe(100);
  });
  it("rejects out-of-range or nonfinite inputs instead of producing a misleading rank", () => {
    for (const score of [-1, 101, Infinity, NaN]) {
      expect(() => calculateFinalScore({ relevanceScore: score, importanceScore: 50, noveltyScore: 50, sourceQualityScore: 50 })).toThrow();
    }
  });
  it("has ordered relevant, worth-reading and must-reading thresholds", () => {
    expect(RELEVANT_THRESHOLD).toBeLessThan(WORTH_READ_THRESHOLD);
    expect(WORTH_READ_THRESHOLD).toBeLessThan(MUST_READ_THRESHOLD);
    expect(MUST_READ_THRESHOLD).toBeLessThanOrEqual(100);
  });
  it("matches case-insensitively, includes Chinese, and uses configured topic weight", () => {
    const result = matchTopics("AGENT tool calling with persistent MEMORY 与长期记忆", topics);
    expect(result.map(match => match.topic.id)).toEqual(["memory", "agent"]);
    expect(result[0].keywords).toEqual(["memory", "记忆"]);
    expect(result[0].score).toBe(100);
    expect(result[1].score).toBe(70);
  });
  it("does not confuse a word fragment with a topic keyword", () => {
    expect(matchTopics("agentic fragmentation and in-memoryless systems", [{ ...topics[0], keywords: ["agent"] }])).toEqual([]);
    expect(matchTopics("agent-based tools", [topics[0]])).toHaveLength(1);
  });
  it("treats regex characters literally in a keyword", () => {
    const literal = [{ ...topics[0], keywords: ["C++", "[tool]"] }];
    expect(matchTopics("C++ and [tool]", literal)[0].keywords).toEqual(["C++", "[tool]"]);
    expect(matchTopics("C and tool", literal)).toEqual([]);
  });
  it("gives empty matches for empty topics or unrelated text", () => {
    expect(matchTopics("Agent", [])).toEqual([]);
    expect(matchTopics("Weather forecast", topics)).toEqual([]);
  });
});
