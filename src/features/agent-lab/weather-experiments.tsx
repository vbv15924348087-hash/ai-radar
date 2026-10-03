"use client";

import { Check, CornerDownRight, FlaskConical, Send, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { makeResult, validateTemperatureInput } from "./engine";
import { getGlossaryTerm, formatSourceRef } from "./curriculum";
import type { useWeatherPlayer } from "./use-player";
import { STEP_COPY } from "./weather-content";
import { LabDialog } from "./lab-shared";
import styles from "./lab.module.css";

type Player = ReturnType<typeof useWeatherPlayer>;
type Preset = Parameters<typeof makeResult>[1];
const PRESETS: { id: NonNullable<Preset>; label: string }[] = [
  { id: "success", label: "有效返回" }, { id: "timeout", label: "查询超时" },
  { id: "wrong-date", label: "返回错误日期" }, { id: "missing-value", label: "缺少温度" },
  { id: "wrong-metric", label: "口径不匹配" }, { id: "wrong-unit", label: "单位不匹配" },
];

export function ToolReturnForm({ player }: { player: Player }) {
  const { run, snapshot: s } = player;
  const [preset, setPreset] = useState<NonNullable<Preset>>("success");
  const [value, setValue] = useState(String(s.request?.logicalQuery === "yesterday" ? run.config.yesterday : run.config.today));
  const [condition, setCondition] = useState(s.request?.logicalQuery === "yesterday" ? run.config.yesterdayCondition : run.config.todayCondition);
  const [error, setError] = useState("");
  function submit(event: FormEvent) {
    event.preventDefault();
    const temperature = validateTemperatureInput(value);
    if (preset === "success" && temperature.error) { setError(temperature.error); return; }
    const candidate = makeResult(run, preset, preset === "success" ? temperature.value! : undefined);
    if (candidate.data) candidate.data.condition = condition;
    player.submit(candidate);
    player.recordOperation(preset === "success" ? "manual-return" : "exception-return");
  }
  return <form className={styles.returnForm} onSubmit={submit} aria-label="提交工具返回">
    <div className={styles.formIntro}><span className={styles.roleBadge}>现在，你是天气工具</span><h3>只回答这一次请求。</h3><p>正在查询 {s.request?.city} · {s.request?.date} · 最高气温 / °C</p><code>{s.request?.id}</code></div>
    <div className={styles.formFields}>
      <label>返回情形<select value={preset} onChange={event => { setPreset(event.target.value as NonNullable<Preset>); setError(""); }}>{PRESETS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      {preset === "success" && <div className={styles.fieldPair}><label>最高气温（°C）<input type="number" min="-80" max="60" step="0.1" value={value} onChange={event => { setValue(event.target.value); setError(""); }} required /></label><label>天气状态<select value={condition} onChange={event => setCondition(event.target.value)}><option>晴</option><option>雨</option><option>多云</option></select></label></div>}
      {preset !== "success" && <p className={styles.smallText}>提交后，观察程序为何拒绝这个结果，以及下一步如何改变。</p>}
      {error && <p role="alert" className={styles.errorText}>{error}</p>}
      <button type="submit" className={styles.primary}><Send size={15} />提交本次工具结果</button>
    </div>
  </form>;
}

export function ConditionsDialog({ player, onClose }: { player: Player; onClose: () => void }) {
  const [today, setToday] = useState(String(player.run.config.today));
  const [yesterday, setYesterday] = useState(String(player.run.config.yesterday));
  const [condition, setCondition] = useState(player.run.config.todayCondition);
  const [error, setError] = useState("");
  const todayInput = validateTemperatureInput(today);
  const yesterdayInput = validateTemperatureInput(yesterday);
  const changed = todayInput.value !== player.run.config.today || yesterdayInput.value !== player.run.config.yesterday || condition !== player.run.config.todayCondition;
  const terminal = ["success", "incomplete", "cancelled"].includes(player.snapshot.status);
  function apply(event: FormEvent) {
    event.preventDefault();
    if (todayInput.error) { setError(`今天：${todayInput.error}`); return; }
    if (yesterdayInput.error) { setError(`昨天：${yesterdayInput.error}`); return; }
    if (!changed) {
      if (terminal) {
        player.restart();
        player.recordOperation("repeat-conditions");
        onClose();
      } else {
        setError("条件尚未变化。请先修改气温或天气，再建立新分支；也可以关闭弹窗，保留当前运行。");
      }
      return;
    }
    player.revise({ today: todayInput.value!, yesterday: yesterdayInput.value!, todayCondition: condition });
    player.recordOperation("change-conditions");
    onClose();
  }
  return <LabDialog title="改变模拟条件" onClose={onClose}><form onSubmit={apply} className={styles.experimentForm}>
    <span className={styles.roleBadge}><FlaskConical size={14} />教学实验</span>
    <p>改变工具将返回的数据，再沿着过程观察结果。已受影响的事实和旧答案会撤销；不受影响的早期步骤保留。</p>
    <div className={styles.presets}><button type="button" onClick={() => { setToday("18"); setYesterday("22"); setError(""); }}>今天更凉：18 / 22</button><button type="button" onClick={() => { setToday("22"); setYesterday("22"); setError(""); }}>两天相同：22 / 22</button><button type="button" onClick={() => { setToday("30"); setYesterday("22"); setError(""); }}>恢复示例：30 / 22</button></div>
    <div className={styles.fieldPair}><label>今天最高气温（°C）<input type="number" required min="-80" max="60" step="0.1" value={today} onChange={e => { setToday(e.target.value); setError(""); }} /></label><label>昨天最高气温（°C）<input type="number" required min="-80" max="60" step="0.1" value={yesterday} onChange={e => { setYesterday(e.target.value); setError(""); }} /></label></div>
    <label>今天的天气<select value={condition} onChange={e => { setCondition(e.target.value); setError(""); }}><option>晴</option><option>雨</option><option>多云</option></select></label>
    <p className={styles.smallText}>这是待返回的模拟设置。它们只有经过查询与检查，才会进入任务的已知信息。穿衣示例也会参考今天的绝对温度与天气。</p>
    {!changed && !error && <p className={styles.smallText} role="status">{terminal ? "设置与刚才相同，可以用相同条件从头再跑。" : "当前设置与主任务相同。修改条件后才会建立新分支。"}</p>}
    {error && <p role="alert">{error}</p>}<button type="submit" className={styles.primary}>{!changed && terminal ? "设置未变，从头再跑" : "应用条件，建立新分支"}<CornerDownRight size={16} /></button>
  </form></LabDialog>;
}

export function GlossaryDialog({ player }: { player: Player }) {
  const term = getGlossaryTerm(player.glossaryId ?? "");
  const [date, setDate] = useState(player.snapshot.request?.date ?? "2026-09-05");
  const [requestVisible, setRequestVisible] = useState(false);
  if (!term) return null;
  const s = player.snapshot;
  const id = term.id;
  return <LabDialog title={term.label} onClose={player.closeGlossary}>
    <p className={styles.stoppedAt}>你刚才停在：{s.stage} · {STEP_COPY[s.stage].title}。关闭后仍保持暂停。</p>
    <h3 className={styles.glossaryQuestion}>{term.plain}</h3><p>{term.explanation}</p>
    <div className={styles.termExperiment}>
      <span className={styles.paperLabel}>在当前案例中试一试</span>
      {id === "parameter" ? <><p>工具保持为 <code>get_weather</code>，只修改日期。</p><label>实验查询日期<select value={date} onChange={e => { setDate(e.target.value); player.recordOperation("parameter-experiment"); }}><option value="2026-09-05">2026-09-05 · 今天</option><option value="2026-09-04">2026-09-04 · 昨天</option></select></label><pre>{JSON.stringify({ tool: "get_weather", arguments: { city: "成都", date, metric: "daily_high", unit: "celsius" } }, null, 2)}</pre><p>现在查的是{date === "2026-09-05" ? "今天" : "昨天"}。同一个工具收到了不同条件。这个副本不会修改主任务。</p></> :
      id === "tool-description" ? <><h4>get_weather：按城市与日期查询天气</h4><dl className={styles.definitionList}><div><dt>必填条件</dt><dd>city 城市 / date 日期 / metric 温度口径 / unit 单位</dd></div><div><dt>用途边界</dt><dd>本课只模拟成都两天的最高气温。</dd></div><div><dt>与请求的区别</dt><dd>说明是用法；请求是本次要查成都的哪一天。</dd></div></dl></> :
      id === "function-calling" ? <><p>城市：成都；日期：{s.request?.date ?? "2026-09-05"}。</p><button className={styles.secondary} onClick={() => setRequestVisible(!requestVisible)}>{requestVisible ? "收起结构化请求" : "把条件填进请求"}</button>{requestVisible && <pre>{JSON.stringify({ tool: "get_weather", arguments: { city: "成都", date: s.request?.date ?? "2026-09-05", metric: "daily_high", unit: "celsius" } }, null, 2)}</pre>}<p>这个操作只生成请求示意。实际执行还要由应用程序调用工具。</p></> :
      id === "observation" ? <>{s.lastResult ? <><p>刚才这次返回对应编号：{s.lastResult.requestId}</p><pre>{JSON.stringify(s.lastResult, null, 2)}</pre><p>{s.error ? `这次未通过检查：${s.error}` : "检查通过的数据可作为下一步依据。"}</p></> : <p>当前尚无返回。请求发出之后，由工具提供结果，程序再检查；“继续”这两个字不含天气数据。</p>}</> :
      id === "context" ? <><p>在这一刻可用的信息：</p><ul><li>用户目标、成都、模拟基准日、比较口径。</li>{s.stage !== "W00" && <li>天气工具的说明。</li>}{s.facts.today && <li>已检查的今天最高气温：{s.facts.today.value}°C。</li>}{s.facts.yesterday && <li>已检查的昨天最高气温：{s.facts.yesterday.value}°C。</li>}</ul><p>未发生的返回不会提前加入。这里是当前任务信息的教学展示，不是模型的完整内部上下文。</p></> :
      id === "action" ? <dl className={styles.definitionList}><div><dt>提出什么请求</dt><dd>任务中的 AI：查成都的指定日期。</dd></div><div><dt>谁实际执行</dt><dd>应用程序：把请求交给天气工具。</dd></div><div><dt>谁返回数据</dt><dd>模拟天气工具：提供数据或错误。</dd></div><div><dt>当前发生什么</dt><dd>{STEP_COPY[s.stage].title}。</dd></div></dl> :
      ["react", "loop"].includes(id) ? <><p>目标 → 查询今天 → 收到结果 → 检查还缺什么 → 查询昨天 → 比较与结束。</p><p>当前已知：今天{s.facts.today ? `${s.facts.today.value}°C` : "未知"}，昨天{s.facts.yesterday ? `${s.facts.yesterday.value}°C` : "未知"}。</p><p>每一轮使用已经获得的结果决定后续步骤。这些文字是公开的教学判断摘要。</p><button className={styles.secondary} onClick={() => { player.closeGlossary(); player.seek(0); }}>回到本次记录起点，逐步回放</button></> :
      id === "finish" ? <><div className={styles.finishCompare}><div><Check size={18} /><strong>成功结束</strong><p>所需查询有效，比较完成，有依据地回答。</p></div><div><TriangleAlert size={18} /><strong>未完成停止</strong><p>同一查询两次失败，信息仍缺失，不编造温差。</p></div></div><p>本课最多尝试两次是教学策略；暂停播放器只是暂时停止观看，和任务停止不同。</p></> : <p>本例中的用法：{STEP_COPY[s.stage].summary}</p>}
    </div>
    <div className={styles.sourceFoot}><strong>原文与说明</strong>{term.sourceRefs.map((ref, index) => <p key={index}>{formatSourceRef(ref)}</p>)}<p>上方可操作部分为教学设计；未调用真实模型。</p></div>
    <button className={styles.primary} onClick={player.closeGlossary}>回到刚才<CornerDownRight size={16} /></button>
  </LabDialog>;
}

export function LearningChecks({ player }: { player: Player }) {
  const s = player.snapshot;
  const questions = [
    { id: "source", title: "今天的气温是从哪里得到的？", options: ["工具返回并通过检查", "在目标里预先给出的事实", "只要提出请求就自动知道"], answer: 0, feedback: `当前今天的有效气温是 ${s.facts.today?.value ?? "未知"}°C，来源是今天的工具返回。请求内容只有查询条件。` },
    { id: "executor", title: "AI 提出 get_weather 请求后，谁把它交给工具？", options: ["应用程序", "请求文本自己执行", "天气数值决定谁执行"], answer: 0, feedback: "记录中先有“提出请求”，再有“程序发出查询”。应用程序承担执行职责。" },
    { id: "next", title: player.run.config.difficulty === "A" ? "这次只要求查今天。有效结果已拿到，该做什么？" : "如果昨天返回了今天的日期，该做什么？", options: player.run.config.difficulty === "A" ? ["检查目标后整理回答", "必须再查十次", "无视已有返回" ] : ["拒绝把它当成昨天，按重试策略处理", "直接把今天气温当成昨天", "缺少昨天也宣布比较成功"], answer: 0, feedback: player.run.config.difficulty === "A" ? "A 的目标只要求今天有效气温，不必执行 B 的全部流程。" : "请求昨天必须返回昨天的数据。一次失败仍可重试；两次失败以未完成状态停止。" },
  ];
  return <section className={styles.learningChecks}><div className={styles.sectionTitle}><h2>把刚才的过程讲明白</h2><span>理解检查 · {Object.keys(player.learning.answers).length} / 3 已作答</span></div><p className={styles.smallText}>观看到终点不等于掌握。用这次模拟中的证据回答。</p><div className={styles.questionGrid}>{questions.map(q => { const answer = player.learning.answers[q.id]; return <div key={q.id} className={styles.question}><h3>{q.title}</h3>{q.options.map((option, index) => <button key={option} aria-pressed={answer?.value === String(index)} onClick={() => player.answer(q.id, String(index), index === q.answer)}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}{answer && <p role="status" className={answer.correct ? styles.correctFeedback : styles.errorText}>{answer.correct ? "判断正确。" : "再对照一下过程。"}{q.feedback}</p>}</div>; })}</div></section>;
}
