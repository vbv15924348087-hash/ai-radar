"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, CircleHelp, FlaskConical, List, Pause, Play, RotateCcw, Settings2, SkipBack, SkipForward, Square, X } from "lucide-react";
import { useState } from "react";
import { useWeatherPlayer } from "./use-player";
import { GLOSSARY, SOURCES, WEATHER_GLOSSARY_IDS } from "./curriculum";
import { DIFFICULTIES, EXPLANATION_TABS, STEP_COPY, type ExplanationTab } from "./weather-content";
import { WeatherScene } from "./weather-scene";
import { ConditionsDialog, GlossaryDialog, LearningChecks, ToolReturnForm } from "./weather-experiments";
import { LabDialog, LabHeader } from "./lab-shared";
import styles from "./lab.module.css";

type Modal = "conditions" | "sources" | "settings" | "history" | "terms" | null;
export function WeatherLesson() {
  const player = useWeatherPlayer();
  const { snapshot: s, run } = player;
  const [modal, setModal] = useState<Modal>(null);
  const [tab, setTab] = useState<ExplanationTab>("why");
  const [directory, setDirectory] = useState(false);
  const copy = STEP_COPY[s.stage];
  const terminal = ["success", "incomplete", "cancelled"].includes(s.status);
  const waiting = s.status === "waiting";
  function open(next: Modal) { player.pause(); setModal(next); }
  function term(id: string) { setModal(null); player.openGlossary(id); }
  function difficulty(id: "A" | "B" | "C") {
    if (id === run.config.difficulty) return;
    player.revise({ difficulty: id });
    if (id === "C") player.setResultMode("manual");
  }
  function enterUnexpectedExperiment() {
    if (run.config.difficulty === "C") player.restart();
    else player.revise({ difficulty: "C" });
    player.setResultMode("manual");
  }
  function revisitLastWaiting() {
    for (let index = run.history.length - 1; index >= 0; index -= 1) {
      if (run.history[index].status === "waiting") {
        player.setResultMode("manual");
        player.seek(index);
        return;
      }
    }
  }
  const playLabel = player.playing ? "暂停" : s.stage === "W00" ? "开始演示" : player.progress >= 1 ? "继续" : "播放";
  const statusLabel = s.status === "success" ? "成功结束" : s.status === "incomplete" ? "未完成停止" : s.status === "cancelled" ? "用户已停止" : waiting && player.resultMode === "manual" ? "等你返回结果" : player.playing ? "正在演示" : "已暂停";

  return <div className={styles.lab}>
    <LabHeader lesson><button className={styles.quietLink} onClick={() => open("sources")}><BookOpen size={15} />原文与说明</button></LabHeader>
    <div className={styles.lesson}>
      <div className={styles.breadcrumb}><button onClick={() => { player.pause(); setDirectory(!directory); }} aria-expanded={directory}><List size={15} />课程目录<ChevronDown size={13} /></button><span>/</span><span>原理入门</span><span>/</span><strong>天气实验</strong><span className={styles.localProgress}>{player.hydrated ? "本浏览器自动保存" : "正在读取学习位置"}</span></div>
      {directory && <nav className={styles.difficultyDirectory} aria-label="本课学习路径">{DIFFICULTIES.map(item => <button key={item.id} onClick={() => difficulty(item.id)} aria-current={run.config.difficulty === item.id ? "step" : undefined}><span>{item.id}</span><div><strong>{item.label}</strong><small>{item.description}</small></div><ArrowRight size={17} /></button>)}</nav>}
      {player.notice && <div className={styles.notice} role="status"><span>{player.notice}</span><button onClick={player.resetSaved}>重置本课保存</button><button className={styles.iconButton} onClick={player.dismissNotice} aria-label="收起保存提示"><X size={15} /></button></div>}
      <div className={styles.lessonHeading}>
        <div><div className={styles.eyebrow}><span />实验 01 · 从工具调用到任务循环</div><h1>{run.config.difficulty === "A" ? "成都，今天最高多少度？" : "成都，今天比昨天热吗？"}</h1><p>沿着一次任务，观察信息怎样变成行动，再变成答案。</p></div>
        <div className={styles.difficultyTabs} role="group" aria-label="选择难度">{DIFFICULTIES.map(item => <button key={item.id} aria-pressed={run.config.difficulty === item.id} onClick={() => difficulty(item.id)}><span>{item.id}</span>{item.label}</button>)}</div>
      </div>
      <div className={styles.taskStrip}><span className={styles.taskBadge}>本次任务</span><p>{run.config.difficulty === "A" ? "查询成都今天的最高气温。" : "查询成都今天和昨天的最高气温，比较温差，并给出穿衣示例。"}</p><span>基准日 2026.09.05<small>教学模拟数据</small></span></div>
      <div className={styles.lessonGrid}>
        <section className={styles.demonstration} aria-label="任务过程演示">
          <div className={styles.demoHeading}><span><i className={`${styles.liveDot} ${player.playing ? styles.activeDot : ""}`} />{statusLabel}</span><span>第 {run.cursor + 1} 个事件 · 修订 {run.revision + 1}</span></div>
          <WeatherScene run={run} snapshot={s} progress={player.progress} reducedMotion={player.reducedMotion} />
          <div className={styles.progressRail} role="progressbar" aria-label="当前片段进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(player.progress * 100)}><span style={{ width: `${player.progress * 100}%` }} /></div>
          <div className={styles.player}>
            <div className={styles.playerMain}>
              <button className={styles.iconButton} disabled={!player.canBack} onClick={player.back} aria-label="上一步" title="上一步"><SkipBack size={19} /></button>
              <button className={styles.playButton} disabled={!player.hydrated || (terminal && !player.playing)} onClick={player.playing ? player.pause : player.play} aria-label={playLabel}>{player.playing ? <Pause size={17} /> : <Play size={17} fill="currentColor" />}{playLabel}</button>
              <button className={styles.iconButton} onClick={player.next} disabled={terminal && run.cursor === run.history.length - 1} aria-label="下一步" title="下一步"><SkipForward size={19} /></button>
              <span className={styles.controlSeparator} />
              <button className={styles.smallButton} onClick={player.replay}><RotateCcw size={14} />重播本段</button>
            </div>
            <div className={styles.playerAux}><label className={styles.speedSelect}><span className={styles.srOnly}>播放速度</span><select aria-label="播放速度" value={player.speed} onChange={event => player.setSpeed(Number(event.target.value) as 0.5 | 1 | 1.5 | 2)}>{[0.5, 1, 1.5, 2].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label><button className={styles.iconButton} onClick={() => open("settings")} title="播放设置" aria-label="播放设置"><Settings2 size={17} /></button><button className={styles.smallButton} onClick={player.stop} disabled={terminal}><Square size={12} />停止</button></div>
          </div>
          <div className={styles.playerSettings}><label>播放节奏<select aria-label="播放节奏" value={player.pace} onChange={event => player.setPace(event.target.value as "guided" | "continuous")}><option value="guided">引导 · 关键处暂停</option><option value="continuous">连续观看</option></select></label><label>工具结果<select aria-label="工具结果提供方式" value={player.resultMode} onChange={event => player.setResultMode(event.target.value as "auto" | "manual")}><option value="auto">模拟环境自动返回</option><option value="manual">我来返回结果</option></select></label></div>
          <div className={styles.playerHint}>{waiting && player.resultMode === "manual" ? "正在等你的工具返回。点击下方“提交本次工具结果”，“下一步”不会补数据。" : player.pace === "guided" ? "引导模式会在关键处暂停。点击“继续”接着看，也可以用“下一步”逐个事件前进。" : player.resultMode === "manual" ? "连续观看仍会等待你提交工具结果。" : "连续观看中，工具结果由模拟环境自动返回。"}</div>
        </section>
        <aside className={styles.stepAside} aria-label="当前步骤解释">
          <div className={styles.stepKicker}><span>{s.stage}</span>此刻发生了什么</div>
          <h2>{s.status === "cancelled" ? "你停止了本次运行" : copy.title}</h2>
          <div className={styles.summaryLabel}>教学判断摘要</div>
          <p className={styles.summary}>{s.status === "cancelled" ? "已停止播放与事件推进。可以回看停止前的记录，或从头开始新的运行。" : copy.summary}</p>
          {s.error && <div className={styles.inlineError} role="alert">{s.error}</div>}
          <div className={styles.knownStatus}><button onClick={() => term("context")}>现在知道什么<CircleHelp size={14} /></button><div><span>今天最高气温</span><strong>{s.facts.today ? `${s.facts.today.value}°C` : "待查询"}</strong></div>{run.config.difficulty !== "A" && <div><span>昨天最高气温</span><strong>{s.facts.yesterday ? `${s.facts.yesterday.value}°C` : "待查询"}</strong></div>}<small>查询次数：今天 {s.attempts.today} · 昨天 {s.attempts.yesterday}</small></div>
          <div className={styles.stepTerms}><span>在这一步认识</span>{copy.terms.map(id => <button key={id} onClick={() => term(id)}>{GLOSSARY.find(item => item.id === id)?.label ?? id}<ArrowRight size={13} /></button>)}</div>
          <button className={styles.quietLink} onClick={() => open("terms")}><CircleHelp size={15} />这个词是什么意思</button>
        </aside>
      </div>
      {waiting && player.resultMode === "manual" && <ToolReturnForm key={s.request?.id} player={player} />}
      {!waiting && !terminal && player.resultMode === "manual" && <div className={styles.manualHint}><CornerHint />已切换为人工返回。演示到“等待工具返回”时，你将为当前请求填写数据。</div>}
      {terminal && <section className={`${styles.outcome} ${s.status !== "success" ? styles.incompleteOutcome : ""}`} aria-label="本次运行结果" data-testid="run-outcome"><div className={styles.outcomeTitle}><span>{s.status === "success" ? <Check size={21} /> : <Square size={18} />}</span><h2>{s.status === "success" ? "任务完成，答案有了依据。" : s.status === "incomplete" ? "任务停止，信息还不完整。" : "本次运行已由你停止。"}</h2></div><p>{s.answer ?? s.stopReason}</p><small>教学模拟数据 · 成都 · 基准日 2026-09-05 · 最高气温（°C）</small>{s.facts.today && <details><summary>追溯回答依据</summary><p>今天：{s.facts.today.date} / {s.facts.today.value}°C / {s.facts.today.condition}</p><code>{s.facts.today.requestId}</code>{s.facts.yesterday && <><p>昨天：{s.facts.yesterday.date} / {s.facts.yesterday.value}°C / {s.facts.yesterday.condition}</p><code>{s.facts.yesterday.requestId}</code></>}<p>计算与穿衣示例：本课确定性教学规则。</p></details>}<div className={styles.outcomeActions}><button className={styles.secondary} onClick={() => open("conditions")}><FlaskConical size={15} />改变条件再试</button><button className={styles.quietLink} onClick={player.restart}><RotateCcw size={15} />从头开始</button>{s.status === "cancelled" && <button className={styles.quietLink} onClick={player.back}><ArrowLeft size={15} />回看停止前</button>}{s.status === "incomplete" && <button className={styles.quietLink} onClick={revisitLastWaiting}>回到最后一次返回，修改结果<ArrowRight size={15} /></button>}</div></section>}
      <section className={styles.stepDetails}>
        <div className={styles.detailTopline}><h2>拆开这一步</h2><button className={styles.quietLink} onClick={() => open("sources")}><BookOpen size={14} />查看来源</button></div>
        <div className={styles.explanationTabs} role="group" aria-label="解释角度">{EXPLANATION_TABS.map(item => <button key={item.id} aria-pressed={tab === item.id} onClick={() => { player.pause(); setTab(item.id); }}>{item.label}</button>)}</div>
        <p className={styles.explanationContent}>{copy[tab]}</p>
        <details className={styles.technical} onToggle={event => { if (event.currentTarget.open) player.pause(); }}><summary>查看程序收到的内容 <span>请求 / 返回 / 已知信息</span></summary><div className={styles.jsonGrid}><div><h3>本次请求</h3><pre>{s.request ? JSON.stringify(s.request, null, 2) : "还没有生成调用请求。"}</pre></div><div><h3>最近一次返回</h3><pre>{s.lastResult ? JSON.stringify(s.lastResult, null, 2) : "尚未收到工具结果。"}</pre></div></div><p>这里使用本课自己的教学协议。不是任何厂商 API 或 MCP 的完整格式。</p></details>
      </section>
      <div className={styles.experimentBar}><div><FlaskConical size={21} /><div><strong>如果返回的结果变了呢？</strong><span>让今天更凉、两天相同，或试一次失败。</span></div></div><button className={styles.secondary} onClick={() => open("conditions")}>改变模拟条件<ArrowRight size={15} /></button><button className={styles.quietLink} onClick={enterUnexpectedExperiment}>进入意外实验</button></div>
      <div className={styles.historyBar}><button className={styles.quietLink} onClick={() => open("history")}><List size={16} />查看已发生的 {run.history.length} 个事件</button><button className={styles.quietLink} onClick={player.restart}><RotateCcw size={14} />从头开始</button></div>
      {s.status === "success" && <LearningChecks player={player} />}
      <footer className={styles.footer}><span>这是可交互的机制模拟 · 使用预设规则和教学模拟数据</span><span>没有调用真实模型或天气服务</span></footer>
    </div>
    {player.glossaryId && <GlossaryDialog key={player.glossaryId} player={player} />}
    {modal === "conditions" && <ConditionsDialog player={player} onClose={() => setModal(null)} />}
    {modal === "terms" && <LabDialog title="这个词是什么意思" onClose={() => setModal(null)}><p className={styles.stoppedAt}>停在 {s.stage} · {copy.title}，选择一个词就地拆解。</p><div className={styles.termList}>{WEATHER_GLOSSARY_IDS.map(id => { const item = GLOSSARY.find(item => item.id === id); return item && <button key={id} onClick={() => term(id)}><strong>{item.label}</strong><span>{item.plain}</span><ArrowRight size={16} /></button>; })}</div></LabDialog>}
    {modal === "settings" && <LabDialog title="播放与保存设置" onClose={() => setModal(null)}><div className={styles.experimentForm}><label className={styles.checkbox}><input type="checkbox" checked={player.reducedMotion} onChange={e => player.setReducedMotion(e.target.checked)} />弱动画模式</label><p>减少移动，保留事件顺序与文字说明。默认尊重系统减少动态效果设置。</p><p>模拟状态和学习记录分别保存在本浏览器。刷新后会回到当前步骤并保持暂停。</p><button className={styles.secondary} onClick={() => { player.resetSaved(); setModal(null); }}>重置本课保存</button><p className={styles.smallText}>只重置本课的模拟与作答记录。没有修改真实工具的记忆文件。</p></div></LabDialog>}
    {modal === "history" && <LabDialog title="本次运行的事件记录" onClose={() => setModal(null)} wide><p className={styles.stoppedAt}>只可定位已经发生的事件。浏览记录不重复调用工具；修改旧返回会建立新分支。</p><ol className={styles.historyList}>{run.history.map((item, index) => <li key={item.id}><button aria-current={index === run.cursor ? "step" : undefined} onClick={() => { player.seek(index); setModal(null); }}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{STEP_COPY[item.stage].title}</strong><small>{item.status === "waiting" ? "等待返回" : item.status === "success" ? "成功结束" : item.error ?? STEP_COPY[item.stage].actor}</small></div><ArrowRight size={15} /></button></li>)}</ol></LabDialog>}
    {modal === "sources" && <LabDialog title="原文与教学设计" onClose={() => setModal(null)} wide><div className={styles.sourceContent}><span className={styles.roleBadge}>当前步骤：{s.stage} · {copy.title}</span><h3>天气任务与循环</h3><p>《原文_AI Agent规划与记忆机制培训.pdf》第 1–3 页，02:01–14:48：成都两天天气、逐次 Action / Observation、比较与结束。工具调用背景见《原文_AI Agent核心原理与架构解析培训.pdf》第 9–11 页。</p><h3>这节课的教学设计</h3><p>基准日 2026-09-05；默认今天最高气温 30°C、昨天 22°C；统一比较最高气温；每次查询最多两次尝试。三档难度、请求编号、字段检查、直接计算、穿衣规则及动效均为本课设计，依据开发规格第 6–8 节。</p><p>原文对计算有手算与工具调用的不同演示。本课直接计算属于实现选择，不推出所有 Agent 必須以同一种方式计算。</p><h3>来源登记</h3>{Object.values(SOURCES).filter(source => ["S1", "S2", "S3"].includes(source.id)).map(source => <div className={styles.sourceEntry} key={source.id}><strong>{source.title}</strong><span>{source.status === "read" ? `已读取 ${source.pageCount} 页` : "资料缺失"}</span><p>{source.note}</p></div>)}<h3>保留待核实的课堂说法</h3><p>“长短期记忆都以向量保存”、Skill 与 Workflow 普遍等价、Token 固定对应字符等概括，不作为标准答案。CoT / Thought 只展示可公开的教学步骤摘要。</p><p className={styles.smallText}>两张附图作为二手课堂纪要对照。完整覆盖、原文顺序映射与审校项保存在项目的课程蓝图文档中；页面没有打包或上传原始 PDF。</p></div></LabDialog>}
    <span className={styles.srOnly} aria-live="polite">{s.stage}，{copy.title}。{statusLabel}</span>
  </div>;
}

function CornerHint() { return <ArrowRight size={15} />; }
