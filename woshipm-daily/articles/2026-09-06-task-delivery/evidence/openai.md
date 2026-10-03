# OpenAI Astra / Responses API 本轮原文核验

对应选题：2026-09-06-05。

核验时段：2026-09-06 17:06:47—17:07:21（北京时间，UTC+08:00）。

本轮重新搜索官方域后，实际读取了下列官方页面。功能指南采用页面提供的 `.md` 原文；API 更新日志使用 `Invoke-WebRequest` 直接读取官方 HTML。以下结论来自本轮原文，不沿用搜索摘要。

## 来源与日期

| 来源 | 原始 URL | 官方日期口径 |
| --- | --- | --- |
| OpenAI API Changelog | https://developers.openai.com/api/docs/changelog | 2026 年 9 月 3 日的两条 Feature 分别记录 GPT-6 Astra 发布及长任务控制能力。该日期本轮仍成立。 |
| Using GPT-6 Astra | https://developers.openai.com/api/docs/guides/latest-model | 页面未提供可确认的独立发布或修订日期；不能把本次检索时间当更新时间。 |
| Async tool calling | https://developers.openai.com/api/docs/guides/async-tool-calling | 同上；能力发布日期由 9 月 3 日更新日志支持。 |
| Mid-turn steering | https://developers.openai.com/api/docs/guides/steering | 同上；能力发布日期由 9 月 3 日更新日志支持。 |

## 可支持文章的五项事实

1. **发布与接口。**9 月 3 日官方 API 日志记录发布 GPT-6 Astra，并单独记录异步工具调用、执行中追加指令、会话中改变推理强度。Astra 的工具调用要求 Responses API。发布日期不应写为 9 月 6 日。来源：Changelog。

2. **异步使独立工作得以继续。**为 function 或 custom tool 设置 `async: true` 后，模型不必在调用工具后停住等待，可继续推理、调用其他工具或处理请求中独立的部分；应用得到真实结果后，用原始 `call_id` 回传。这里没有承诺依赖该工具结果的后续工作也能提前完成。来源：Async tool calling / Using GPT-6 Astra。

3. **工具仍由应用执行和管理。**异步调用不会把工具执行转交 OpenAI，也不会替开发者管理后台作业。当前指南写明支持 GPT-6 Astra 及后续模型；异步适用于应用运行的 function/custom tools，不适用于托管的内置工具；应直接调用，不能为 programmatic tool calling 配置异步工具。在 Multi-agent mode 下，不应同时组合 async tools 与 parallel tool calls。来源：Async tool calling 的 How async tools work 和 Compatibility。

4. **中途改需求具有接口与模型限制。**Mid-turn steering 允许用户在响应尚未结束时补充要求或改变方向；当前支持 GPT-6 Astra 经 Responses API 的 WebSocket 连接使用，GPT-5.6 及更早模型不支持。它不会改写已返回的输出、撤销先前动作或取消已经启动的工具。来源：Mid-turn steering 开头。

5. **“指令已接收”并不表示“变更已执行”。**`response.steer.accepted` 表示输入已排队。服务端在继续执行新要求前，会先结束当前输出项和已经运行的托管工具工作。排队的 steering 输入只属于当前连接，不随原始 response 保存；断线后不能假定它仍会生效。来源：Mid-turn steering 的 Send a steering message / Handle failures and disconnects。

## 可用短引文

> Your application still executes the tool.

来源：https://developers.openai.com/api/docs/guides/async-tool-calling

> Steering does not rewrite output already sent to your application, undo earlier actions, or cancel tools that have already started.

来源：https://developers.openai.com/api/docs/guides/steering

## 与此前摘要的差异

此前摘要关于 9 月 3 日发布、等待期间可处理独立工作、应用执行工具、steering 依赖 WebSocket 且不能撤销既有动作的结论均仍成立，本轮未发现相反原文。

本轮补充了上次短摘要未展开的兼容边界：不适用于托管内置工具、不可为 programmatic tool calling 配置异步工具、Multi-agent mode 中不同时组合 async 与 parallel tool calls；以及 steering 的“已排队不等于已执行”和断线后的待处理输入不保证保留。它们是此次阅读补充的事实，不应表述为官方今日新增。

## 写作推论的边界

可据上述事实提出产品建议：独立任务与有依赖任务应分开编排，需求变更状态应区分“已接收”和“已应用”，已产生外部效果的动作需要应用自有的取消或补偿设计。以上是文章的设计推论，不能写成 OpenAI 已经提供完整任务调度、回滚或补偿机制。

本文证据未做 API 实测，不包含账户开放情况保证、独立性能测量或厂商基准的复现。
