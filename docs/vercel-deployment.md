# Vercel 部署与云端数据

AI Radar 页面由 Next.js 提供；来源、主题、同步、收藏和选题通过 API 保存。原先这些 API 使用进程本机的 SQLite 和 JSON 文件。Vercel 的函数运行环境不会在不同实例或重新部署之间共享这些文件，因此浏览器能打开页面，却无法可靠地读取和保存同一份工作区数据。配置 Turso 后，Vercel 使用共享 libSQL 数据库保存工作台记录和简报。

## 配置 Vercel

1. 在 Turso 创建数据库并生成数据库访问令牌。
2. 在 Vercel 项目的 **Settings → Environment Variables** 中，为需要使用的环境（至少 Production）设置：

   - `TURSO_DATABASE_URL`：Turso 数据库 URL。
   - `TURSO_AUTH_TOKEN`：数据库访问令牌。
   - `RADAR_ADMIN_PASSWORD`：云端工作区口令，至少 16 位。

3. 如果使用自定义域名，在 `RADAR_PUBLIC_ORIGIN` 填入完整 HTTPS origin，例如 `https://radar.example.com`。Vercel 分配的项目域名会自动识别；自定义域名需加入此变量。多个 origin 可用逗号分隔。
4. 如需用 OpenAI 分析新采集内容，设置 `AI_PROVIDER=openai` 和 `OPENAI_API_KEY`。未启用 OpenAI 时，应用会使用开发用分析器；数据库持久化不依赖 OpenAI Key。
5. 将修改推送到 Vercel 项目连接的 Git 分支，Vercel 会触发部署。首次云端请求会初始化数据库表；迁移本机数据前先完成下面的只读预览。

云端口令用于解锁工作区。通过浏览器保存的来源、主题、阅读状态和用户选题会写入 Turso，部署实例之间共享。请在部署日志中确认环境变量已经绑定到正确环境；修改变量后需重新部署。

如果明确选择无需登录的公开工作区，可设置 `RADAR_ACCESS_MODE=public`，无需 `RADAR_ADMIN_PASSWORD`。任何获得网址的访客都可以读取和修改数据。只允许公开阅读时设置 `RADAR_ACCESS_MODE=readonly`；写请求会被服务端拒绝。未设置时默认 `private`，需要口令。

## 从本机迁移

在有本机 `data/radar.sqlite` 和 `woshipm-daily/digests` 的项目目录运行：

```powershell
npm run cloud:migrate
```

默认模式以只读 SQLite 事务读取一份 WAL 一致快照，校验正式简报 JSON，并打印各表和简报的数量；它不会连接 Turso，也不会上传数据。检查数量符合预期后，在被 Git 排除的 `.env.cloud.local` 中配置 `TURSO_DATABASE_URL`、`TURSO_AUTH_TOKEN`，再明确执行：

```powershell
npm run cloud:migrate -- --execute
```

执行会按外键顺序分批迁移 `sources`、`topics`、`contents`、`intelligence`、`observations` 和 `sync_runs`，并导入正式简报目录中通过 schema 校验的 JSON。云端已有记录和同日期简报不会被覆盖，因此失败后可重复执行。迁移跳过 `sync_locks`、本机 `selections` 目录和私有文章；它不把本机选题意图写到云端。

## 发布后续简报

Vercel 不会自动检索或撰写每日资讯。原有本机研究与导入流程仍由本机自动化执行。`digest:import` 会更新本机正式 JSON 和 Markdown；配置 `.env.cloud.local` 后，这次明确的导入命令也会把同一份简报写入云端。本机网页不会读取这个文件，继续使用原有 SQLite 和本机选题：

```powershell
npm run digest:import -- .\woshipm-daily\digests\2026-10-03.json
```

需要单独发布或重发已有 JSON 时，使用：

```powershell
npm run digest:publish -- .\woshipm-daily\digests\2026-10-03.json
```

两个命令都会校验简报 JSON。单独发布命令只写入 Turso 的 `digest` 文档；重复发布同一天会更新那一期简报，不会更改 `selection`。云端工作区的选题保存在云端数据库，不会自动回写到本机 `woshipm-daily/selections`。登录云端后，可通过 `GET /api/digests/YYYY-MM-DD` 查看该期简报和 `selection`。

Turso 数据独立于 Vercel 构建产物和部署生命周期。切换到新的 Turso URL 时，先为新数据库配置相同环境变量，再将本机数据迁移到新库；切换后，已有云端选题仍留在旧数据库，需按产品提供的官方 API 读取或另行迁移。
