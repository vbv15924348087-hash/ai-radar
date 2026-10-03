/** 课程内容登记。来源转述、课堂类比和本课实现选择分别标记。 */
export type EvidenceKind = "source-derived" | "source-analogy" | "teaching-design" | "needs-review";
export type SourceId = "S1" | "S2" | "S3" | "IMG1" | "IMG2" | "SPEC";
export interface SourceRef {
  sourceId: SourceId;
  pdfPage?: number;
  section?: string;
  timeStart?: string;
  timeEnd?: string;
}
export interface SourceEntry {
  id: SourceId;
  title: string;
  status: "read" | "missing";
  pageCount?: number;
  note: string;
}
export interface LessonEntry {
  id: string;
  title: string;
  goal: string;
  caseName: string;
  implemented: boolean;
  route?: string;
  sourceRefs: SourceRef[];
}
export interface GlossaryTerm {
  id: string;
  label: string;
  plain: string;
  explanation: string;
  lessonIds: string[];
  sourceRefs: SourceRef[];
  evidenceKind: EvidenceKind;
  status: "已审校转述" | "课堂类比" | "教学设计" | "待核实" | "资料不足";
}

export const SOURCES: Record<SourceId, SourceEntry> = {
  S1: { id: "S1", title: "原文_AI Agent核心原理与架构解析培训.pdf", status: "read", pageCount: 20,
    note: "已逐页读取 20 页文字转写；所述课堂架构图及提示词截图未附于 PDF。" },
  S2: { id: "S2", title: "原文_AI Agent规划与记忆机制培训.pdf", status: "read", pageCount: 12,
    note: "已逐页读取 12 页文字转写；天气、规划和文件记忆案例可追溯。" },
  S3: { id: "S3", title: "Agent原理深度解析(2).pdf", status: "missing",
    note: "当前工程及用户指定 Downloads 顶层未找到同名或明确同版资料；不声称已覆盖补充内容。" },
  IMG1: { id: "IMG1", title: "课堂纪要截图：AI Agent规划与记忆机制培训", status: "read",
    note: "用户附图 1，已查看；二手纪要，用于与 S2 对照，不替代主来源。" },
  IMG2: { id: "IMG2", title: "课堂纪要截图：Agent核心原理与架构", status: "read",
    note: "用户附图 2，已查看；二手纪要，尾部内容截断，不推断未展示部分。" },
  SPEC: { id: "SPEC", title: "Codex_Agent_Interactive_Learning_Goal (1).md", status: "read",
    note: "用户指定的开发规格；模拟日期、最高气温口径、异常分支和最多两次尝试属于教学设计。" },
};

const ref = (sourceId: SourceId, pdfPage?: number, timeStart?: string, timeEnd?: string, section?: string): SourceRef =>
  ({ sourceId, pdfPage, timeStart, timeEnd, section });
const design = (section: string): SourceRef[] => [ref("SPEC", undefined, undefined, undefined, section)];

export const LESSONS: LessonEntry[] = [
  { id: "L01", title: "从给答案到完成任务", goal: "指出邮件文字与模拟操作各自完成到哪里。", caseName: "请假邮件与日程", implemented: false,
    sourceRefs: [ref("S1", 2, "05:56", "10:01"), ref("S1", 3, "10:50", "14:11")] },
  { id: "L02", title: "一道停车场题怎样被拆开", goal: "修改数字并解释公开解题步骤与答案的关系。", caseName: "停车场剩余车位", implemented: false,
    sourceRefs: [ref("S1", 18, "92:00", "96:36")] },
  { id: "L03", title: "一次天气查询怎样发生", goal: "指出城市与日期来源，区分请求、执行和结果。", caseName: "成都今天的最高气温", implemented: true, route: "/agent-lab/weather",
    sourceRefs: [ref("S1", 10, "49:55", "52:49"), ref("S2", 1, "02:01", "03:41")] },
  { id: "L04", title: "为什么还要继续一轮", goal: "补齐两天天气，改变返回并解释继续、成功和未完成停止。", caseName: "成都两天天气与温差", implemented: true, route: "/agent-lab/weather",
    sourceRefs: [ref("S2", 3, "11:58", "14:48"), ...design("6.2–6.6 天气样板课")] },
  { id: "L05", title: "生日活动先规划再执行", goal: "让场地不可用，解释哪些计划需要重新检查。", caseName: "生日活动", implemented: false,
    sourceRefs: [ref("S2", 4, "17:28", "19:38"), ref("S2", 5, "21:37", "23:01")] },
  { id: "L06", title: "一条信息怎样保存并再次使用", goal: "区分保存在哪里、何时读取和读进哪一次任务。", caseName: "课内虚拟记忆文件", implemented: false,
    sourceRefs: [ref("S2", 6, "29:11", "30:43"), ref("S2", 8, "38:14", "39:29"), ref("S1", 8, "37:43", "38:10")] },
  { id: "L07", title: "更多工具怎样接进来", goal: "区分工具接入、一次调用请求和实际执行。", caseName: "给出行助手增加工具", implemented: false,
    sourceRefs: [ref("S1", 9, "45:07", "47:56"), ref("S1", 10, "49:55", "52:49"), ref("S1", 11, "53:55", "54:47")] },
  { id: "L08", title: "把完整 Agent 放回一项任务", goal: "标出各方职责，并解释道路受阻后为什么重新查询。", caseName: "出行任务与路线变化", implemented: false,
    sourceRefs: [ref("S1", 5, "23:12", "25:53"), ref("S1", 13, "67:30", "70:31"), ref("S1", 16, "82:27", "86:08")] },
];

function term(id: string, label: string, plain: string, explanation: string, lessonIds: string[], sourceRefs: SourceRef[],
  evidenceKind: EvidenceKind = "source-derived", status: GlossaryTerm["status"] = "已审校转述"): GlossaryTerm {
  return { id, label, plain, explanation, lessonIds, sourceRefs, evidenceKind, status };
}

export const GLOSSARY: GlossaryTerm[] = [
  term("agent", "完成任务的应用（Agent）", "它这次要完成什么？", "课堂把 Agent 解释为能观察、调用工具并采取行动来完成目标的大模型应用。本页面使用预设规则模拟其中的机制。", ["L01", "L08"], [ref("S1", 2, "06:50", "08:41")]),
  term("goal", "任务目标（Goal）", "做到哪里才算完成？", "今天气温查询与两天比较是不同目标；今天有结果，并不代表两天比较已经完成。", ["L01", "L03", "L04"], [ref("S1", 4, undefined, undefined, "本页开头，17:10 之前的目标说明"), ref("S2", 1, "02:01")]),
  term("prompt", "给应用的文字要求（Prompt）", "这段话要求做什么？", "课堂通过提示词说明目标和调用工具的要求；天气课中的任务文字是明确的教学输入。", ["L01", "L03", "L07"], [ref("S1", 9, "46:15", "47:25")]),
  term("system-prompt", "预先配置的要求（System Prompt）", "还没提问时为什么已有要求？", "S2 的上下文查看案例中包含系统提示词。本课把预先配置与用户这次输入分开；不推断所有产品的比例、路径和计费。", ["L06", "L08"], [ref("S2", 6, "26:04", "28:31")]),
  term("user-prompt", "用户这次的要求（User Prompt）", "哪些条件由用户提出？", "在这个演示里，成都、相对模拟日期的今天和昨天、比较要求来自任务文字。", ["L01", "L03"], [ref("S1", 4, "17:10"), ...design("6.1 任务与教学改编边界")], "teaching-design", "教学设计"),
  term("llm", "处理语言的模型（LLM）", "模型和外面的应用各做什么？", "课堂用大脑比喻大模型，用额外能力比喻工具与执行。该比喻用来分清职责，不把模型当成人。", ["L01", "L08"], [ref("S1", 12, "67:08"), ref("S1", 13, "67:30", "68:52")], "source-analogy", "课堂类比"),
  term("response", "交回给用户的回答（Response）", "回答中的数字能追到哪里？", "本课最后的回答只能使用已经检查通过的信息；回答会说明是完成目标，还是缺数据而停止。", ["L01", "L04"], design("6.3 W11–W12；6.5 分支"), "teaching-design", "教学设计"),
  term("profile", "职责与身份（Profile）", "这项任务里它负责什么？", "课堂要求先明确身份、职责和目标，再安排任务。本课用天气比较这个边界明确的职责说明。", ["L08"], [ref("S1", 13, "70:06", "70:31"), ref("S1", 14, "73:24", "74:00")]),
  term("planning", "安排任务顺序（Planning）", "先做哪件事？", "根据目标、已知条件和还缺的信息安排步骤；课堂以摄影和出行说明规划内容来自具体业务。", ["L05", "L08"], [ref("S1", 14, "74:58"), ref("S1", 15, "80:15", "82:03")]),
  term("thought", "教学判断摘要（Thought）", "为什么此时查昨天？", "可核对的教学摘要：今天数据已知，还缺昨天，所以发起昨天的请求。这是预编排说明，不是真实模型的私有思维。", ["L04"], [ref("S2", 1, "02:01"), ...design("8.4 思考区域的边界")], "teaching-design", "教学设计"),
  term("action", "本轮采取的动作（Action）", "是谁实际执行？", "本课中模型角色提出请求，应用程序把请求交给模拟工具；返回后由程序检查。提出请求与执行完成是不同事件。", ["L03", "L04", "L08"], [ref("S1", 13, "68:24", "68:52"), ...design("6.3 W03–W06")], "teaching-design", "教学设计"),
  term("observation", "执行后收到的结果（Observation）", "这份结果对应哪个请求？", "在当前查询中，它是工具返回的天气或错误信息，带着对应请求编号。检查通过的数据才进入有效信息；单说继续没有提供执行结果。", ["L03", "L04"], [ref("S2", 1, "01:39", "02:50"), ref("S2", 3, "11:58", "14:48")]),
  term("environment", "提供结果的一方（Environment）", "结果由谁给回？", "课堂练习由学生扮演环境，给回当前动作的结果。本课可由你扮演模拟工具，也可选择模拟环境自动返回。", ["L03", "L04", "L08"], [ref("S2", 3, "15:14"), ...design("6.6 用户扮演环境")]),
  term("loop", "一轮接一轮（Agent Loop）", "拿到结果为什么还要继续？", "先看当前目标还缺什么，执行一个动作，收到结果后重新检查目标。本课今天和昨天分别查询，不提前使用未返回的数据。", ["L04", "L08"], [ref("S1", 4, "20:19", "21:34"), ref("S2", 3, "14:48")]),
  term("react", "判断、行动、再看结果（ReAct）", "上一轮怎样影响下一轮？", "课堂用想、做、看解释 ReAct。天气例子中今天返回后仍缺昨天，昨天有效后才能比较；不把这套演示规则当作所有 Agent 的唯一实现。", ["L04", "L08"], [ref("S1", 4, "21:34"), ref("S2", 3, "14:10", "14:48")]),
  term("cot", "展开题目的解法（CoT）", "数字变化时哪一步跟着变？", "停车场例子可公开展示先算总车位、再减已停车位的教学解法。原课堂也记录了加提示词后差异不大的情况，不保证提示词能揭示真实内部思维。", ["L02"], [ref("S1", 18, "92:00", "96:36")]),
  term("plan-and-execute", "先列计划再执行（Plan-and-Execute）", "全局目标在哪里被检查？", "生日活动先列整体步骤再逐项执行，失败时重新检查计划；这是课堂框架，是否重做每项取决于具体教学情境。", ["L05"], [ref("S2", 4, "17:28", "19:38")]),
  term("planner", "制定计划的一方（Planner）", "谁先把步骤排出来？", "课堂角色扮演中，计划员先提出全局计划，供执行阶段逐项处理。", ["L05"], [ref("S2", 3, "15:14"), ref("S2", 4, "17:28")]),
  term("executor", "执行计划的一方（Executor）", "谁按当前计划去做？", "课堂的执行员逐项执行计划，并接收环境提供的结果；职责分开不代表必须使用两个模型。", ["L05"], [ref("S2", 3, "15:14"), ref("S2", 4, "17:28")]),
  term("replan", "重新检查计划（Replan）", "哪次结果使计划需要改变？", "课堂在失败后要求回到全局规划，并承认演示中只局部修正的版本不符合这次练习要求。保留这个课堂限定。", ["L05"], [ref("S2", 4, "18:13", "19:38")]),
  term("reflection", "纠错后回顾（Reflection）", "下次怎样少犯同样的错？", "课堂提到纠正错误后记住教训；没有给出完整实现。本阶段只登记，后续需补齐可检验的保存和读取过程。", ["L05", "L06"], [ref("S1", 18, "93:33")]),
  term("reflexion", "待核对名称（Reflexion）", "它和课堂的反思是同一个词吗？", "规格列名，但现有转写不足以确认特定方法、论文或与 Reflection 的关系。暂不把两者直接等同。", ["L05"], design("5.1 不得遗漏的深入内容"), "needs-review", "资料不足"),
  term("self-critics", "自我检查名称（Self-critics）", "具体检查了哪一项？", "规格要求核对该名称；主来源没有足够的独立定义。检查动作可教学演示，术语的正式范围待补充。", ["L05"], design("5.1 不得遗漏的深入内容"), "needs-review", "资料不足"),
  term("subgoal-decomposition", "把目标拆成小任务（Subgoal decomposition）", "哪些小结果合起来才够？", "课堂明确讲到拆分任务；英文名称由规格登记。天气例子把两天查询与比较分开，属于本课可检验的拆解。", ["L04", "L05"], [ref("S1", 5, "27:21"), ...design("5.1 不得遗漏的深入内容")]),
  term("context", "这一步能用的信息（Context）", "现在知道什么，还不知道什么？", "本课当前信息包含用户要求、已经展示的工具说明和已经发生的结果。昨天尚未返回时，不能把昨天温度放进去。", ["L03", "L04", "L06"], [ref("S2", 5, "25:05", "25:49"), ref("S2", 7, "32:00", "32:24"), ...design("7 Context 小实验")], "teaching-design", "教学设计"),
  term("token", "模型处理文本的片段（Token）", "一个字一定对应一个 Token 吗？", "原课堂以给模型看的字符作类比。这里不推导固定的一字一 Token，也不从截图里的占用比例推导实际费用。", ["L06"], [ref("S1", 6, "28:46", "29:28"), ref("S1", 7, "32:58", "33:27")], "source-analogy", "课堂类比"),
  term("vector", "一组数值的类比（Vector）", "示意坐标是不是模型的真实数字？", "课堂用坐标和物品特征帮助理解向量。示意数值不是实际模型参数，不能认定每个维度都对应一个人能命名的特征。", ["L06"], [ref("S1", 7, "33:27", "34:13"), ref("S1", 8, "37:07")], "source-analogy", "课堂类比"),
  term("vectorization", "转成向量表示（向量化）", "哪些资料被转换了？", "课堂将知识数据变成一组向量的过程称为向量化；没有提供具体模型或数值算法，本阶段不补造。", ["L06"], [ref("S2", 7, "33:36", "34:31")]),
  term("corpus", "供处理的资料（语料）", "哪些内容属于这批资料？", "课堂以语言资料和图片资料举例。课程只说明资料与其含义的区别，不复制原文中的个人或刻板印象例子。", ["L06"], [ref("S2", 7, "34:45", "35:28"), ref("S2", 8, "35:31", "35:54")]),
  term("semantics", "内容表达的意思（语义）", "用户这句话想表达什么？", "课堂用用户问题表达的意思解释语义；它与资料本身不是同一层面的说法。", ["L06"], [ref("S2", 8, "37:05", "37:31")]),
  term("short-term-memory", "本次可用的记忆（短期记忆）", "这次能用的信息从哪里来？", "S1 将长短期记忆概括为向量存储，S2 又用上下文和文件案例说明。分类与存储方式的关系需要核实；本课只展示具体信息是否进入当前任务。", ["L06"], [ref("S1", 8, "37:43", "38:10"), ref("S2", 5, "23:37", "25:49")], "needs-review", "待核实"),
  term("long-term-memory", "跨任务保存的记忆（长期记忆）", "关掉旧任务后，什么仍被保存？", "文件记忆案例说明一条偏好可以保存后再使用，不能据此把所有长期记忆都归为文件，也不能把它全部等同向量数据库。", ["L06"], [ref("S1", 8, "37:43", "38:10"), ref("S2", 8, "38:14", "39:29")], "needs-review", "待核实"),
  term("episodic-memory", "历史事件记录（情景记忆）", "它记住了之前哪件事？", "课堂以旧任务记录解释情景记忆。后续课只模拟指定记录的保存和读取，不声称任意产品都会自动记住所有历史。", ["L06"], [ref("S2", 6, "29:11", "30:19")]),
  term("semantic-memory", "事实与知识（语义记忆）", "这条知识表达什么？", "课堂把事实知识、知识库和语义向量联系起来；本阶段登记其讲法，不把向量数据库认定为这类记忆唯一实现。", ["L06"], [ref("S2", 6, "30:19"), ref("S2", 7, "33:36", "34:31")]),
  term("procedural-memory", "可复用的操作步骤（程序记忆）", "下次任务可照哪份步骤做？", "课堂用固定操作流程解释程序记忆，并以 Workflow、Skill 为例。流程与技能之间的普遍等价关系另列待核实。", ["L06", "L08"], [ref("S2", 6, "30:43"), ref("S2", 7, "31:02", "31:37")]),
  term("file-memory", "课内保存的记录（文件记忆案例）", "保存、读取分别发生了吗？", "下一课将以浏览器模拟 memory.md 的写入与读取。本轮只有蓝图，没有改动系统或真实工具的记忆文件。", ["L06"], [ref("S2", 8, "38:14", "39:29"), ...design("11 记忆写入与再次读取")], "teaching-design", "教学设计"),
  term("tool", "可以调用的能力（Tool）", "有什么工具可用？", "课堂以天气搜索、计算器和已有软件为例。本演示的 get_weather 是本地模拟天气工具，未连接天气服务。", ["L03", "L07", "L08"], [ref("S1", 9, "45:07", "46:15"), ref("S2", 3, "11:58", "13:38")]),
  term("tool-description", "工具使用说明", "调用前需要知道哪些条件？", "本课工具说明写出名称、用途以及必须填写的城市、日期、单位和温度口径。它说明能做什么，一次请求说明这次做什么。", ["L03", "L07"], design("6.3 W01–W02；7 工具说明"), "teaching-design", "教学设计"),
  term("api", "程序请求的接口（API）", "请求通过哪里交给工具？", "课堂用请求后拿回结果说明接口。本课仅用本地事件模拟这个交接，不代表请求已经发到真实网络。", ["L03", "L07"], [ref("S1", 11, "53:55", "54:47")]),
  term("function", "可按约定调用的函数（Function）", "名称相同，每次条件能否不同？", "课堂将函数和工具调用相连；把提示词、JSON、代码和函数完全等同的概括待核实。本课只使用 get_weather 作为示意名称。", ["L03", "L07"], [ref("S1", 10, "48:50", "49:55")], "needs-review", "待核实"),
  term("parameter", "这次查询的条件（参数）", "改日期后工具收到什么？", "城市和日期告诉同一个工具这次查哪里、哪一天；温度口径与单位确保比较的是同一类数值。解释实验使用副本，不会自动改动已暂停的主任务。", ["L03"], design("6.4 请求与返回；7 参数实验"), "teaching-design", "教学设计"),
  term("json", "结构化数据写法（JSON）", "程序收到哪些字段？", "本课用键和值展示请求条件及返回数据，这是示意格式，不是某厂商的接口协议。原课堂的提示词等价代码说法不用于判题。", ["L03", "L07"], [ref("S1", 9, "47:56"), ...design("6.4 请求与返回的示意格式")], "teaching-design", "教学设计"),
  term("json-schema", "字段约束说明（JSON Schema）", "允许填写什么样的值？", "规格列出该术语，但主来源未充分展开正式规范。本课字段检查属于自己的教学规则，不宣称实现完整 JSON Schema。", ["L03", "L07"], design("5.1 深入清单；6.4 教学协议"), "needs-review", "资料不足"),
  term("function-calling", "提出工具调用请求（Function Calling）", "请求提出后已经执行了吗？", "本例先把城市和日期放入调用请求，再由应用程序交给模拟工具，最后接收结果。请求本身不是执行成功的证据。", ["L03", "L07"], [ref("S1", 10, "49:55", "50:38"), ...design("6.3 W02–W06")], "teaching-design", "教学设计"),
  term("mcp", "统一工具接入的类比（MCP）", "接入和本次调用有什么区别？", "课堂以 Type-C 接口比喻统一接入，帮助理解减少重复适配的方向。类比不证明任意工具即插即用，也不涵盖权限或协议全部细节。", ["L07"], [ref("S1", 10, "51:21", "52:49")], "source-analogy", "课堂类比"),
  term("harness", "组织模型工作的一层（Harness）", "模型外面还需要哪些安排？", "课堂用模型加应用本体的方式说明 Harness。特定产品现状和结构没有外部核实；本课仅用于区分模型角色与负责调度的程序。", ["L08"], [ref("S1", 5, "23:12", "25:53")]),
  term("workflow", "预先安排的流程（Workflow）", "路线预先写好，还是过程中再选择？", "课堂用固定路线和实习生对照 Workflow 与自主规划。它是教学对照，不推出所有 Workflow 都必须逐步询问，也不排除混合实现。", ["L05", "L08"], [ref("S1", 16, "84:37", "86:08"), ref("S1", 17, "87:46", "88:29")], "source-analogy", "课堂类比"),
  term("skill", "可复用任务说明（Skill）", "这份步骤能复用到什么任务？", "S2 以 Markdown 步骤说明 Skill，并说在讲者认知里可替代 Workflow 的一些能力。保留限定，不设为两者普遍等价的标准答案。", ["L06", "L08"], [ref("S2", 7, "31:02", "31:37")], "needs-review", "待核实"),
  term("finish", "完成或停止的条件（Finish）", "停止就一定完成了吗？", "信息齐全并完成比较可成功结束；同一查询两次失败则未完成停止。这是本课策略，停止不自动代表学习掌握。", ["L03", "L04"], [ref("S2", 3, "14:10", "14:48"), ...design("6.5 分支和重试次数")], "teaching-design", "教学设计"),
  term("icl", "待补充的学习方式（ICL／Few-shot）", "提供少量例子能说明什么？", "S3 尚未找到；不从名称编造定义、实验或研究结论。", ["L07"], [ref("S3", undefined, undefined, undefined, "规格列出的补充范围，原资料缺失")], "needs-review", "资料不足"),
  term("tool-learning", "待补充的工具学习（Tool Learning）", "如何学会使用工具？", "S3 尚未找到；提示词诱导、训练内化及相关研究名称均进入补充队列。", ["L07"], [ref("S3", undefined, undefined, undefined, "工具学习补充范围，原资料缺失")], "needs-review", "资料不足"),
  term("multi-agent", "待补充的多方协作（Multi-Agent）", "任务怎样分工与交接？", "S3 尚未找到；单 Agent 困境、主从委托、接力传递等模式尚无可核对的原文，不建空课程或补造研究结论。", ["L08"], [ref("S3", undefined, undefined, undefined, "多 Agent 补充范围，原资料缺失")], "needs-review", "资料不足"),
];

export const WEATHER_GLOSSARY_IDS = ["parameter", "tool-description", "function-calling", "observation", "context", "action", "react", "loop", "finish"] as const;

export const MODULES = [{ id: "agent-lab", title: "Agent 原理交互课程", route: "/agent-lab", lessonIds: LESSONS.map((lesson) => lesson.id) }];

export function getGlossaryTerm(id: string): GlossaryTerm | undefined {
  return GLOSSARY.find((entry) => entry.id === id);
}

export function formatSourceRef(sourceRef: SourceRef): string {
  const source = SOURCES[sourceRef.sourceId];
  const parts = [source.title];
  if (sourceRef.pdfPage !== undefined) parts.push(`PDF 第 ${sourceRef.pdfPage} 页`);
  if (sourceRef.timeStart) parts.push(`${sourceRef.timeStart}${sourceRef.timeEnd ? `–${sourceRef.timeEnd}` : ""}`);
  if (sourceRef.section) parts.push(sourceRef.section);
  if (source.status === "missing") parts.push("资料缺失，未读取");
  return parts.join(" · ");
}
