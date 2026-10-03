# AI Radar v0.1

## 仓库判断与架构
初始工作区只有空 Git 仓库，无现有代码、技术栈或可复用组件。使用 TypeScript strict、Next.js App Router、SQLite、Drizzle，构建本地单用户模块化单体。SQLite 文件持久化，不依赖云托管或分布式队列。

## Domain 与 Modules
- `src/domain`：Source、ContentItem、IntelligenceItem、Topic、评分、处理状态。无 React、网络 API 或 AI SDK 依赖。
- `src/application`：明确的 Adapter / AI Provider 端口，采集编排、去重、处理与导出。
- `src/infrastructure`：SQLite / Drizzle Repository、HTTP、六类 Adapter、AI Provider 和集中 Prompt。
- `src/app` / `src/ui`：Today、Sources、Library、Topics；页面只通过应用入口读取数据，客户端只调用本站 API。
- `scripts`：手动同步与薄层轮询调度。与网页共用 SourceSyncService。

## 数据模型
Source 保存订阅配置与最后检查状态。RawItem 是短期采集载荷，不交给 UI。ContentItem 保存统一正文、原始快照、规范 URL、指纹和处理状态。IntelligenceItem 保存结构化中文分析、证据、四维评分、版本与阅读/收藏状态。Topic 保存研究意图、关键词和权重。Observation 保存重复内容的多来源证据；eventId 和 SemanticDeduplicator 预留事件聚合扩展。SyncRun 保存阶段错误、重试次数和度量。

## Pipeline
Discover → Fetch → Normalize → Deduplicate → Classify → Score / Summarize → Persist。
先持久化 ContentItem，再调用模型；模型失败不会丢失原始内容。逐条隔离失败，单源失败不阻止其他源。去重按来源外部 ID、规范 URL、正文指纹。处理失败内容可重试。SQLite 同步锁阻止并发重复写入。

## Dependency Direction
UI / HTTP → Application → Domain；Infrastructure 实现 Application 的变化点。装配只发生在服务入口。Ranking 在 Domain，Prompt / Provider / Schema 相互独立。

## 实施顺序
M0 检查与设计（完成）→ M1 Domain、Schema、Repository 和测试 → M2 RSS 真实采集与持久化 → M3 去重、Topics、Ranking、结构化分析 → M4 Today → M5 逐项验证其余 Adapter → M6 Library、Topics、Markdown。每步使用实际运行和测试确认。

## 风险与取舍
外部 API 权限、RSS 格式差异、模型凭证与非确定输出是主要风险。每个 Adapter 有输入验证，网络有超时和响应大小限制，AI 输出经 Schema 和证据校验。无密钥时 development provider 明示为规则分析，不冒充 AI 中文总结。X 仅通过正式 API，缺少授权时明确失败。v0.1 不构建微服务、向量数据库或 Obsidian 插件。
