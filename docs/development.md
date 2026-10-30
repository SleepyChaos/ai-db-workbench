# 开发与验证

## 本地开发

环境：Rust 1.98+，Node.js 24+。npm 锁文件与 Cargo.lock 均提交到仓库。

首先安装依赖并构建页面：

```bash
cd web
npm ci --ignore-scripts
npm run build
cd ../agent
npm ci --ignore-scripts
```

终端一，从 `server/` 运行 `cargo run --locked`。默认监听 `127.0.0.1:8080`，提供 `../web/dist` 静态资源，自动创建 `server/local-data/sessions` 和内部令牌文件。

终端二，从 `agent/` 运行 `npm start`。默认监听 `127.0.0.1:3001`，连接 Rust 8080，读取 `../server/local-data/internal-token`。真实模型配置通过环境变量注入，也可从 agent 目录运行 `node --env-file=../.env src/server.ts`（需要先创建根目录 `.env`）。

终端三可从 `web/` 运行 `npm run dev`，使用 Vite 热更新。`/api` 和 `/health` 代理到本机 Rust，前端没有数据库或模型凭据。

## 接口

| 接口 | 用途 |
| --- | --- |
| `GET /health` | Rust 自身健康，不依赖模型或数据库 |
| `GET /api/status` | Rust 与 Pi 状态、模型配置状态 |
| `GET /api/databases` | 九种计划适配、零连接、查询和写入能力为 false |
| `GET /api/sessions/{uuid}` | 当前会话的成功完成消息；不存在时返回空消息 |
| `POST /api/chat` | `{session_id, message}`；成功后 SSE，错误事件表示本轮未完成 |
| `GET /api/internal/capabilities` | Pi 的只读能力工具；要求内部 Bearer 令牌 |

Pi 服务内部提供 `GET /health` 与 `POST /chat`。Rust → Pi 使用 HTTP + NDJSON，Rust 将其转换为浏览器 SSE；请求断开时关闭上游流并请求取消 Pi。接口事件包含 `start`、`delta`、`tool_start`、`tool_end`、`error`、`done`。

历史完整上下文只在 Rust 与 Pi 之间传递；浏览器只获得可展示消息。只在最终完成且持久化成功后发送 `done`。未完成消息仅保留在当前浏览器页面并标记“未保存”。

当前只注册 `get_database_capabilities`，不注册文件、终端、任意网络或数据库写入工具。未来数据库接口不能仅凭模型声明判断只读或确认状态。

## 自动化验证

```bash
cd agent
npm run check
npm test
cd ../web
npm run build
cd ../server
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked
cd ..
node scripts/integration.mjs
docker compose up --build -d --wait
node scripts/smoke.mjs
```

- Rust 测试：内部工具鉴权、跨站请求拒绝、会话存储。
- Pi 测试：真实 Agent 循环访问本机测试模型，产生工具调用并验证内部认证，随后输出中文。
- 端到端：真实 Rust + Pi 服务、SSE、工具回调、重启恢复与上下文续接、提供方错误、并发限制、取消后重试。
- Compose 冒烟：页面及 JS 静态资源、Rust、Pi、能力清单、认证、未配置模型行为；不会消费模型额度。
- CI 对推送和 PR 执行上述检查。

端到端脚本中的模型服务仅为测试夹具，不存在于生产 Compose 中。真实外部模型仍需要使用者填写自己的密钥、模型与接口地址进行验证。

## 后续数据库适配

首个适配器按 MySQL 开始，逐步增加连接存储、连接测试、元数据读取、只读查询与计划执行。九种计划数据库的清单目前由 Rust 的 `catalogue()` 提供，尚不是驱动注册表；增加驱动时将其替换为按能力探测的适配模块。不要把当前状态页误认为已实现数据库管理。

不在这次骨架中增加数据库容器；后续用 Compose profiles 按需启动测试库。
