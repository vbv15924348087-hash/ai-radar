"use client";

import { ArrowLeft, ArrowRight, Check, CloudSun, FileText, Send, Server, Sun, Thermometer, TriangleAlert } from "lucide-react";
import type { Run, Snapshot } from "./engine";
import { STEP_COPY } from "./weather-content";
import { WeatherDrawing } from "./lab-shared";
import styles from "./lab.module.css";

export function WeatherScene({ run, snapshot: s, progress, reducedMotion }: { run: Run; snapshot: Snapshot; progress: number; reducedMotion: boolean }) {
  const copy = STEP_COPY[s.stage];
  const returning = s.stage === "W06" || (s.stage === "W09" && s.status !== "waiting") || s.stage === "W13";
  const moving = returning || ["W03", "W04", "W08"].includes(s.stage);
  const ready = s.stage !== "W00";
  const terminal = ["success", "incomplete", "cancelled"].includes(s.status);
  const showRequest = !["W00", "W01"].includes(s.stage);
  const pendingDay = s.request?.logicalQuery === "yesterday" ? "昨天" : "今天";
  const visualProgress = reducedMotion ? 1 : progress;
  const requestPercent = s.stage === "W03" ? visualProgress * 50 : s.stage === "W04" ? 50 + visualProgress * 50 : visualProgress * 100;
  return <div className={styles.scene} data-testid="weather-scene" data-stage={s.stage}>
    <div className={styles.sceneTopline}><span>{copy.actor}</span><span>{s.stage} / {copy.short}</span></div>
    <div className={styles.workbench}>
      <section className={styles.notebook} aria-label="当前任务信息">
        <div className={styles.notebookHeader}><FileText size={17} /><span>任务中的 AI</span><span>当前信息</span></div>
        <div className={styles.notebookBody}>
          <span className={styles.paperLabel}>目标清单</span>
          <h3>{run.config.difficulty === "A" ? "成都今天最高多少度？" : "比较两天气温，给出穿衣示例。"}</h3>
          <div className={styles.factRow}><span className={s.facts.today ? styles.checkCircle : styles.emptyCircle}>{s.facts.today && <Check size={12} />}</span><div>今天 · 09.05<span>{s.facts.today ? "已通过返回检查" : "最高气温还未知"}</span></div><strong data-testid="today-fact">{s.facts.today ? `${s.facts.today.value}°C` : "—"}</strong></div>
          {run.config.difficulty !== "A" && <div className={styles.factRow}><span className={s.facts.yesterday ? styles.checkCircle : styles.emptyCircle}>{s.facts.yesterday && <Check size={12} />}</span><div>昨天 · 09.04<span>{s.facts.yesterday ? "已通过返回检查" : "最高气温还未知"}</span></div><strong data-testid="yesterday-fact">{s.facts.yesterday ? `${s.facts.yesterday.value}°C` : "—"}</strong></div>}
          {s.comparison ? <div className={styles.comparison} data-testid="comparison"><span>今天 − 昨天</span><div>{s.facts.today?.value}<small>−</small>{s.facts.yesterday?.value}<small>=</small><strong>{s.comparison.difference > 0 ? "+" : ""}{s.comparison.difference}°C</strong></div><p>{s.comparison.description}</p></div> : <p className={styles.notebookNote}>{run.config.difficulty === "A" ? "拿到一条有效返回，就能回答本次问题。" : s.facts.today && s.facts.yesterday ? "两天的有效数据已齐，下一步比较最高气温。" : s.facts.today ? "今天有了。还要补齐昨天，才能比较。" : "先找到数据，再形成有依据的回答。"}</p>}
        </div>
        <div className={styles.notebookFoot}>信息只在返回检查通过后加入</div>
      </section>
      <div className={styles.connection} aria-label="请求与结果的传递路径">
        <div className={styles.dispatch}><Server size={19} /><span>应用程序</span><small>{s.request?.status === "sent" ? "转交请求 · 检查返回" : "接收并执行请求"}</small></div>
        <div className={styles.requestRail}><span>请求 →</span><span>← 结果</span></div>
        {moving && <div data-testid="moving-packet" className={`${styles.packet} ${returning ? styles.returnPacket : ""}`} style={{ left: `${returning ? 100 - visualProgress * 100 : requestPercent}%` }}>{returning ? <ArrowLeft size={14} /> : <Send size={13} />}<span>{returning ? "返回结果" : "查询条件"}</span></div>}
        <div className={styles.connectionStatus}>{terminal ? (s.status === "success" ? "本次任务已完成" : "本次任务已停止") : s.status === "waiting" ? "等待工具返回" : moving ? (returning ? "结果进入检查" : "请求正在传递") : "每次只处理当前请求"}</div>
      </div>
      <section className={styles.weatherStation} aria-label="天气工具与本次请求">
        <div className={styles.stationHeader}><CloudSun size={19} /><span>天气工具</span><span>教学模拟</span></div>
        {s.stage === "W00" ? <div className={styles.stationIdle}><WeatherDrawing compact /><p>还没有发出查询</p><span>工具返回前，不会知道气温。</span></div> : <>
          <div className={styles.stationTitle}><Sun size={26} /><div><strong>成都</strong><span>按指定日期查询最高气温</span></div></div>
          <div className={styles.toolName}><code>get_weather</code><span>{ready ? "可用工具" : "尚未配置"}</span></div>
          {showRequest ? <div className={styles.requestSheet}>
            <div><span>{s.request?.status === "sent" ? "本次已发出的请求" : s.request ? "已提出，尚未执行" : "正在填写请求草稿"}</span><ArrowRight size={14} /></div>
            <dl><div><dt>城市</dt><dd>成都</dd></div><div><dt>日期</dt><dd>{s.request?.date ?? "2026-09-05"}<small>{pendingDay}</small></dd></div><div><dt>口径</dt><dd>最高气温 · °C</dd></div></dl>
            {s.request && <code className={styles.requestId} title={s.request.id}>{s.request.id}</code>}
          </div> : <div className={styles.toolDescription}><p>用途：查某个城市某一天的天气。</p><p>必填条件：城市、日期、温度口径、单位。</p><p>这份说明告诉你怎么用工具；还没有本次天气结果。</p></div>}
          {s.lastResult && <div className={`${styles.returnReceipt} ${s.error ? styles.badReceipt : ""}`}><span>{s.error ? <TriangleAlert size={15} /> : <Check size={15} />}{s.error ? "返回未通过检查" : "返回已通过检查"}</span><strong>{s.error ? "不能用于计算" : `${s.lastResult.data?.value ?? "—"}°C · ${s.lastResult.data?.condition ?? ""}`}</strong></div>}
        </>}
      </section>
    </div>
    <div className={styles.sceneCaption}><Thermometer size={14} />教学模拟数据 · 基准日 2026-09-05 · 统一比较最高气温（°C）</div>
  </div>;
}
