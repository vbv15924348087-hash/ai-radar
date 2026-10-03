"use client";

import Link from "next/link";
import { ArrowRight, BookOpen, Check, ChevronDown, MousePointer2, Pause, RotateCcw } from "lucide-react";
import { useState } from "react";
import { LESSONS } from "./curriculum";
import { LabHeader, WeatherDrawing } from "./lab-shared";
import styles from "./lab.module.css";

export function LabHome() {
  const [outline, setOutline] = useState(false);
  return <div className={styles.lab}>
    <LabHeader />
    <div className={styles.home}>
      <div className={styles.eyebrow}><span />原理入门 / 交互课程</div>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <h1>从一次天气查询，<br />看懂 Agent 如何<span>行动。</span></h1>
          <p>一个目标，为什么需要好几步？<br />跟着任务走，停下来拆解，再亲手改变它的结果。</p>
          <Link href="/agent-lab/weather" className={styles.primary}>进入天气实验<ArrowRight size={18} /></Link>
          <div className={styles.heroMeta}>无需编程基础<span>·</span>学习位置保存在本浏览器</div>
        </div>
        <div className={styles.heroScene}>
          <div className={styles.sceneLabel}><span className={styles.liveDot} />正在研究的问题<span>实验 01</span></div>
          <WeatherDrawing />
          <div className={styles.heroQuestion}>“成都今天比昨天热多少，<br />我该穿什么？”</div>
          <div className={styles.heroDate}>模拟基准日 2026.09.05 · 教学模拟数据</div>
        </div>
      </section>
      <section className={styles.homeBelow} aria-label="学习方式">
        <div className={styles.homeIntro}><span className={styles.eyebrow}>动手，才看得见因果</span><h2>让过程变得可理解。</h2><p>这是可交互的机制模拟。<br />每一步由可复现的教学规则驱动。</p></div>
        <div className={styles.method}><Pause size={22} /><h3>随时停下来</h3><p>请求从哪里来、谁在执行？<br />在当前步骤展开解释。</p></div>
        <div className={styles.method}><MousePointer2 size={22} /><h3>亲手返回结果</h3><p>扮演天气工具，改变气温，<br />或者让一次查询失败。</p></div>
        <div className={styles.method}><RotateCcw size={22} /><h3>回去再看一遍</h3><p>保留每一步的现场，<br />对照结果怎样影响下一步。</p></div>
      </section>
      <section className={styles.coursePreview}>
        <div><BookOpen size={20} /><div><h2>从一次查询，到处理意外</h2><p>A 一次查询 → B 完成目标 → C 处理意外 · 同一个案例，逐步深入</p></div></div>
        <Link className={styles.quietLink} href="/agent-lab/weather">开始学习 <ArrowRight size={17} /></Link>
      </section>
      <button className={styles.outlineToggle} aria-expanded={outline} onClick={() => setOutline(!outline)}>查看课程蓝图与当前范围<ChevronDown size={16} /></button>
      {outline && <div className={styles.outlineList}><p className={styles.smallText}>本轮交付天气样板（覆盖 L03、L04 的天气机制）。其余课程已登记蓝图，尚未开发；样板验收后先验证记忆课。</p>{LESSONS.map(lesson => <div key={lesson.id}><span>{lesson.id}</span><strong>{lesson.title}</strong><span>{lesson.implemented ? <><Check size={13} />天气样板</> : "内容蓝图"}</span></div>)}</div>}
      <footer className={styles.footer}><span>基于两份 Agent 培训原文整理 · 教学设计与原文观点分别标注</span><span>本地模拟 · 无需 API Key</span></footer>
    </div>
  </div>;
}
