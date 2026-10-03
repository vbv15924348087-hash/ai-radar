import type { Snapshot } from "./engine";

export type ExplanationTab = "origin" | "why" | "change" | "next";
export const EXPLANATION_TABS: { id: ExplanationTab; label: string }[] = [
  { id: "origin", label: "从哪里来" }, { id: "why", label: "为什么这样做" },
  { id: "change", label: "这里做了什么" }, { id: "next", label: "下一步去哪" },
];
export const STEP_COPY: Record<Snapshot["stage"], { title: string; short: string; actor: string; summary: string; origin: string; why: string; change: string; next: string; terms: string[] }> = {
  W00: { title: "先把目标说清楚", short: "读懂目标", actor: "用户", summary: "要回答这道题，先找出缺少的信息。", origin: "城市、模拟基准日和任务目标来自本课给定的用户要求。最高气温、摄氏度是本课约定的比较口径。", why: "当前还没有收到天气数据。仅凭一句问题，无法算出真实有依据的温差。", change: "任务被整理成可检查的要求。问号代表未知信息，不是气温为零。", next: "先查看可以使用的天气工具，再把城市和日期交给它。", terms: ["tool-description", "context"] },
  W01: { title: "先认识可用的工具", short: "查看工具", actor: "开发者配置", summary: "有一个按城市和日期查询天气的工具，但它还没有被调用。", origin: "工具说明来自开发者配置；本课用预设数据模拟天气工具。工具名和字段是教学设计。", why: "需要知道工具能做什么、需要哪些条件，才能提出有意义的请求。", change: "当前可用信息加入工具名称、用途和必填条件。工具说明不包含今天的查询结果。", next: "把成都、今天对应的日期和比较口径填入请求。", terms: ["tool-description", "parameter"] },
  W02: { title: "把任务条件填进请求", short: "填写条件", actor: "任务中的 AI", summary: "工具不变，传入的条件决定这次查什么。", origin: "成都来自用户要求；今天换算为模拟基准日 2026-09-05。daily_high 和 celsius 分别表示最高气温与摄氏度。", why: "只说“查天气”不够具体。明确城市、日期和温度口径，才能让返回结果满足本任务。", change: "生成 get_weather 的参数草稿，此刻尚未发出，也没有执行结果。", next: "把调用请求交给应用程序，由程序执行工具调用。", terms: ["parameter", "function-calling"] },
  W03: { title: "请求交给应用程序", short: "提出请求", actor: "任务中的 AI → 程序", summary: "提出请求与真正执行，是两个不同的步骤。", origin: "调用请求由本课的模拟规则根据任务条件生成。请求编号用于把后续返回与这次调用关联。", why: "模型生成的请求需要交给能执行工具的应用程序。一个请求文本本身不会取得天气。", change: "请求已提出，尚未发出。尝试次数此时还没有增加。", next: "程序接收请求，将它交给模拟天气工具。", terms: ["function-calling", "action"] },
  W04: { title: "程序实际发出查询", short: "执行查询", actor: "应用程序 → 天气工具", summary: "这一次查询开始执行，接下来要等工具返回。", origin: "程序使用已提出请求的城市、日期、单位和口径。它不会自行补入没有返回的气温。", why: "任务需要外部信息。在这个演示里，应用程序负责把请求交给模拟工具。", change: "请求从“已提出”变成“已发出”，当前日期的尝试次数增加一次。", next: "等待模拟环境自动返回，或者由你扮演工具提交本次结果。", terms: ["action", "observation"] },
  W05: { title: "等待今天的工具返回", short: "返回今天", actor: "天气工具", summary: "当前请求只查今天，返回也应该对应今天。", origin: "返回数据由本地模拟环境或你填写的工具表单提供，不是真实天气服务。", why: "请求已经发出，但还没有执行结果。在人工模式中，“下一步”不能代替工具提供数据。", change: "程序正等待关联到当前请求编号的返回。尚未检查的数据不能进入已知事实。", next: "提交本次工具结果后，程序检查日期、城市、单位、口径与必要字段。", terms: ["observation", "context"] },
  W06: { title: "检查通过，今天成为已知信息", short: "接收今天", actor: "程序 → 当前信息", summary: "刚才返回的数据，现在才可以成为后续步骤的依据。", origin: "今天的气温来自画面中的工具返回，保留相应请求编号。", why: "工具返回需要与任务匹配；本课检查通过后，才把它记作有效事实。", change: "今天的日期、最高气温和天气状态进入当前可用信息。昨天仍然未知。", next: "一次查询任务可以准备结束；比较任务还需要昨天的数据。", terms: ["observation", "context", "react"] },
  W07: { title: "知道今天，为什么还要继续？", short: "再看目标", actor: "任务中的 AI", summary: "今天已知，昨天仍未知。目标要求比较两天，因此还要一轮。", origin: "这一步使用最初目标和已检查的今天数据，没有读取任何未来的工具返回。", why: "完成一次动作不等于完成整个目标。缺少昨天最高气温，就无法做同口径比较。", change: "本课规则根据缺失的信息决定下一步：只查询昨天，保留今天的有效结果。", next: "生成昨天的独立请求，并由程序发出。这就是在结果影响下继续的一轮。", terms: ["react", "loop", "context"] },
  W08: { title: "为昨天发出独立请求", short: "查询昨天", actor: "任务中的 AI → 程序 → 工具", summary: "同一个工具，这次的日期变成昨天。", origin: "昨天由模拟基准日减一天得到：2026-09-04。新请求拥有自己的编号。", why: "目前缺昨天数据。重查今天不会补齐这个缺口。", change: "程序向模拟工具发出昨天的请求，已知的今天结果继续保留。", next: "只接收当前请求的返回，检查它是否真的属于昨天。", terms: ["parameter", "action", "observation"] },
  W09: { title: "昨天的返回也要检查", short: "返回昨天", actor: "天气工具 → 应用程序", summary: "返回写着“成功”，还要确认内容符合这次请求。", origin: "数据来自昨天这次请求的模拟返回，不能与今天请求的编号混用。", why: "如果返回日期是今天，或者没有温度，仍然无法得到昨天的有效气温。", change: "待返回时保留未知状态；通过检查后，昨天的数据进入有效事实。", next: "两天都有效时再计算；不匹配的返回进入异常分支。", terms: ["observation", "context"] },
  W10: { title: "把两条有效信息放在一起", short: "计算温差", actor: "本课计算规则", summary: "今天最高气温减昨天最高气温，结果由当前有效数据算出。", origin: "参与计算的两个值都来自已经检查的工具返回，可按请求编号追溯。", why: "只有城市、日期、单位和口径匹配，两个值的比较才符合本课任务。", change: "温差随数据计算。正值表示今天更高，负值表示更低，零表示相同。", next: "检查是否已经获得任务要求的全部信息，再整理最终回答。", terms: ["context", "finish"] },
  W11: { title: "检查目标是否完成", short: "检查完成", actor: "本课完成规则", summary: "信息齐全才能结束；停止本身不代表成功。", origin: "完成条件来自本课的任务要求，而不是播放到最后一张画面。", why: "A 难度需要今天数据；B、C 还需要昨天数据和有效比较。", change: "逐项核对有效事实和计算结果。穿衣示例由今天的绝对温度和天气生成。", next: "满足目标后输出有依据的回答，并标记成功结束。", terms: ["finish"] },
  W12: { title: "有依据地完成任务", short: "整理回答", actor: "任务结果", summary: "回答的每一部分，都能回到刚才发生的步骤。", origin: "气温来自有效返回；温差来自计算；穿衣示例来自本课对今天气温及天气的预设规则。", why: "目标要求的信息已经齐全，本次任务可以成功结束。", change: "停止执行并保留完整的事件记录。任务成功并不自动代表你已掌握知识。", next: "改变一个条件再运行，或完成下方三道理解检查，解释过程为何改变。", terms: ["finish", "react", "loop"] },
  W13: { title: "这个返回不能直接使用", short: "处理意外", actor: "应用程序检查", summary: "无效返回保留在记录里，但不会变成有效事实。", origin: "异常由本次工具返回触发，具体问题见当前错误说明。", why: "日期、单位、口径、编号不匹配，或关键数据缺失，都无法满足当前查询。", change: "本次结果不进入有效事实。已有的有效信息继续保留。", next: "本课最多尝试两次。还有机会就只重试缺失日期；耗尽后明确以未完成状态停止。", terms: ["observation", "finish", "react"] },
};

export const DIFFICULTIES = [
  { id: "A", label: "一次查询", description: "只查今天，看清请求和返回。" },
  { id: "B", label: "完成目标", description: "查两天，比较温差，整理建议。" },
  { id: "C", label: "处理意外", description: "改变返回，观察重试和停止。" },
] as const;
