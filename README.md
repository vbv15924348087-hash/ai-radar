# AI Radar / Personal Intelligence Agent

本地运行的个人情报工作台：订阅一手来源，采集、去重、按研究主题分析和评分，每天优先展示 10 条内容，历史进入情报库并可导出 Markdown。

## 每日精选与写作选题

打开 [每日精选](http://127.0.0.1:3000/briefings)，阅读 Codex 实时检索并核对原文的中文简报。每条显示原始发布日期、时效范围、官方链接、事实摘要、产品经理视角和可写角度。勾选材料、填写方向并点击「保存选题」后，选择会持久化；可复制写作请求回到 Codex，按所选材料继续成文。

每日北京时间 20:00 的 Codex 自动化负责更新精选并在原任务通知，电脑需要在线且 Codex 运行。此流程与 RSS 同步、development 规则排序分别运行，不依赖另外配置模型 API。数据与维护说明位于 [每日精选流程](woshipm-daily/WORKFLOW.md)。新简报用 `npm run digest:import -- <JSON路径>` 校验导入，无需重新构建。更新简报不会覆盖用户选择；定时任务只生成阅读材料，待用户选题后继续写作和投稿。

## 运行

Windows 用户可双击桌面上的 **AI Radar** 快捷方式。它会复用已运行的工作台，或在后台启动现有生产版本，等待就绪后使用默认浏览器打开；连续双击不会重复启动服务器。关闭浏览器后服务仍在本机运行。

启动脚本保存在 `scripts/launch-radar.ps1`。如果移动了项目，运行 `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/install-shortcut.ps1` 重建桌面入口。启动失败会显示中文提示；每次启动及服务输出保存在 `data/launcher/`。端口被其他程序占用时不会关闭该程序。快捷方式需要已经安装依赖并完成生产构建。

需要 Node.js 22.13+（已在 Windows / Node.js 24 验证）。

```powershell
npm install
Copy-Item .env.example .env.local  # 首次配置；已有文件时直接编辑，勿覆盖
npm run dev
```

打开 http://127.0.0.1:3000 。生产模式使用 `npm run build` 后 `npm start`。本地模式仅绑定本机地址；Vercel 云端模式使用 Turso 持久数据库与单用户访问口令，配置步骤见 [Vercel 部署与数据迁移](docs/vercel-deployment.md)。

先在「信息源」添加来源（或点击官方预设），点击单源/全部同步，再在 Today 查看按分数排序的今日处理结果。首次启动只预置六个可编辑的研究主题，不插入虚构新闻。Today 按处理日期收录，条目仍明确显示原始发布日期；历史数据位于 Library。

当前工作区已配置开发规则模式及适用于本机 DNS 的 Cloudflare 解析。`.env.local`、数据库和 `.qa` 验证数据不会进入 Git。

## AI 分析

没有密钥时 `AI_PROVIDER=development` 会使用真实采集内容、关键词匹配与明确标注的规则评分，保留原文摘录；它不会翻译正文或冒充模型研判。

启用模型分析：在本机 `.env.local` 设置以下字段，保存后重启应用。不要把密钥提交到仓库。

```dotenv
AI_PROVIDER=openai
OPENAI_API_KEY=填写你的密钥
OPENAI_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

OpenAI Provider 使用 Responses API 的严格 JSON Schema 输出中文结论、意义、变化、产品影响、主题和证据。API、集中 Prompt、Zod Schema 独立；模型返回通过 Schema 后，还必须通过原文引用和来源链接校验。失败内容保留快照并记录可重试的错误，不会静默切回开发模式。`OPENAI_BASE_URL` 可指向支持 Responses + Structured Outputs 的兼容服务；Anthropic/Gemini 可通过新增 AIProvider 接入，当前没有声称已支持的实现。

从开发模式切到模型后，可运行 `npm run sync -- --retry` 重新分析已有开发结果。修改 Topics 的名称、描述、关键词或权重会影响后续分析；v0.1 不自动批量重算已完成的模型结论。四维总分 = 相关性 40% + 重要性 30% + 新颖度 20% + 来源质量 10%。来源优先级控制同步顺序。

已核对的官方接口：[Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)、[GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)。实际账户调用需要有效密钥；自动化测试使用注入的响应验证请求与失败行为。

## 来源能力

| 类型 | 输入示例 | 实际采集范围 |
| --- | --- | --- |
| RSS | `https://openai.com/news/rss.xml` | RSS 2.0、Atom、RSS 1.0；单次最多 50 条 |
| Blog | 官方博客 RSS / Atom URL | 使用博客订阅中的正文/描述；不自动抓取普通网页全文 |
| GitHub | `openai/codex` 或 GitHub 仓库 URL | 官方公开 Releases API；最多 10 个版本；可配 `GITHUB_TOKEN` |
| Paper | `cat:cs.AI` 或论文 RSS / Atom URL | arXiv 查询最多 30 条；公开订阅最多 50 条 |
| YouTube | 24 位 `UC...` 频道 ID 或 `/channel/` URL | 官方频道 RSS 的视频标题、描述和链接；不含字幕，不支持 handle 解析 |
| X | `@karpathy` 或 X 主页 URL | 正式用户时间线 API，最多 30 条；需要 `X_BEARER_TOKEN` 及对应 API 权限 |

没有抓取私有网页、登录态爬取或非正式 X 绕行逻辑。X 缺少凭证会报告配置错误。RSS/Blog/Paper/YouTube 共用 FeedAdapter，仅订阅地址解析不同；类型信息在统一 ContentItem 中保留。

这些是最近内容的有界批次，暂不做历史分页回填，也不保证捕获两次同步间超出批次窗口的全部更新。优先选择稳定官方订阅并根据来源频率调整同步间隔。

## 同步、重试与持续运行

```powershell
npm run sync                         # 同步全部启用来源
npm run sync -- --source=来源ID        # 同步单源
npm run sync -- --retry               # 重试失败内容；模型已启用时也升级开发结果
npm run scheduler                    # 立即同步后按间隔循环；保持进程运行
```

`SYNC_INTERVAL_MINUTES` 默认 60。调度器只调用 SourceSyncService；不会安装系统服务或创建 Codex 定时任务。应用或调度器停止时不会继续采集。页面内的同步操作是手动触发；启用来源表示它会参与下一次全量/计划同步。

数据库锁避免网页、CLI 和调度器同时处理。崩溃后锁最多五分钟过期，下一次同步恢复中断内容为可重试失败。来源失败互相隔离；阶段错误和次数在「同步记录」可见。采集阶段失败的重试会重新发现/抓取，AI 失败优先重用已存原文。

## 数据和配置

SQLite 默认 `data/radar.sqlite`，可用 `DATABASE_PATH` 修改。首次打开自动执行版本化迁移和主题初始化；删除的主题不会重新出现。备份时先停止应用和调度器，再复制数据库。已采集来源可修改名称、优先级和启用状态；更换地址/类型请新增来源，确保外部 ID 与历史证据的归属正确。移除来源仅软删除订阅，历史情报保留。

同来源外部 ID、规范化 URL、正文指纹去重。Observation 记录多来源原始快照；短描述同时纳入标题，防止“Read more”类通用文案误合并。语义去重端口和 eventId 已预留，当前不进行语义相似度计算或跨平台事件聚类。相同 externalId 的正文修订不会作为新条目重新分析。

`RADAR_TIMEZONE` 默认 `Asia/Shanghai`，用于 Today 和 Library 日期边界。来源请求限制为公开 HTTP(S)，验证 DNS/IP、重定向、端口、响应大小与超时，外部 HTML 按文本存储/展示。若 VPN 的 DNS 返回 `198.18.x.x` 合成地址，可设置 `RADAR_DNS_RESOLVER=cloudflare`；它通过固定公共 IP 的 TLS DNS-over-HTTPS 查询真实公共 IP，并继续执行地址和重定向校验。

Markdown 使用可解析的 YAML frontmatter，包含来源、类型、主题 ID、评分、发布时间和原文链接，可导入 Obsidian。未实现 Obsidian 插件。Prompt 将正文放在不可信数据区域，不提供工具执行能力，证据必须对应原文；正文截断会明确告知模型。v0.1 新颖度是模型对当前材料的估计，尚未与完整历史语料做语义比较。

如果浏览器能打开海外博客，但采集连接超时，可在 `.env.local` 设置 `RADAR_HTTP_PROXY=http://127.0.0.1:代理端口`，使用本机已经运行的 HTTP(S) 代理，并保持 `RADAR_DNS_RESOLVER=cloudflare`。代理连接的目标仍是经过验证的公网 IP，HTTPS 继续校验原网站证书；配置修改后需要重启应用和调度器。代理关闭时，对应来源会报告连接错误。

较大的正文订阅可以设置 `RADAR_HTTP_TIMEOUT_MS=45000`；取值范围为 1000–120000 毫秒，默认 15000。AI 学习来源的分工和推荐阅读顺序见 [AI 学习入口](AI学习入口.md)。

## 验证

```powershell
npm run typecheck
npm test
npm run build
npm run smoke:live  # 可选：真实网络采集，两次同步，检查持久化/去重/导出
```

单元与集成测试覆盖真实内存 SQLite、适配器标准化、网络边界、三层去重、状态转换、失败重试、同步锁、Topic 权重、评分、结构化 AI 输出、证据校验、搜索筛选、时区以及 Markdown 元数据。`smoke:live` 在 `.qa` 下创建独立数据库，输出两轮度量与示例 Markdown，不向常用数据库灌入测试数据。

模块关系和实施判断见 [ARCHITECTURE.md](ARCHITECTURE.md)，主要工程取舍见 [DECISIONS.md](DECISIONS.md)。
