# AI DB Workbench

面向后端开发、运维和个人开发者的 AI 数据库工作台。

通过对话上传数据、创建数据库对象、查询和修改数据；通过数据库工作台检查连接、查看真实结构与内容，并使用原生脚本完成常规操作。

**项目状态：可运行的项目骨架。Rust、Vue 和真实 Pi SDK 已接通；数据库适配器、文件导入与数据库执行尚未实现。**

## 快速启动

需要已启动的 Docker Engine / Docker Desktop 和支持 `--wait` 的 Docker Compose。

```bash
docker compose up --build -d --wait
```

打开 <http://localhost:8080>。无需模型密钥即可启动两个服务和界面；此时页面明确显示“待配置模型”，不会生成模拟回答。首次构建需要联网下载镜像和依赖。

启用真实对话：复制 `.env.example` 为 `.env`，填写 `PI_PROVIDER`、`PI_MODEL`、`PI_API_KEY`，兼容接口还需要 `PI_BASE_URL`，然后重新创建 agent：

```bash
cp .env.example .env
# 编辑 .env，填入自己的配置后执行：
docker compose up -d --force-recreate agent
```

- `openai-compatible`：支持 Chat Completions 流式输出和工具调用的接口；`PI_BASE_URL` 通常以 `/v1` 结尾。
- `openai` / `anthropic`：使用 Pi 内置模型目录，`PI_MODEL` 填写对应提供方的完整模型 ID。
- 配置检查只验证字段和模型目录，真实凭据与接口兼容性在首次请求时验证。
- 不要提交 `.env`；模型密钥仅注入 agent 容器。当前是本机单用户应用，默认只绑定 `127.0.0.1`。

建议第一句话：“请调用工具，查看当前支持哪些数据库，以及有没有真实连接。”这会经过 Pi → Rust 的真实能力接口，结果应为九种计划适配、零连接。

```bash
docker compose ps
docker compose logs --tail=80 app agent
docker compose down
```

普通 `down` 保留会话和内部认证卷。`down -v` 会删除这些数据，请只在明确需要重置时使用。

## 两个核心页面

- **AI 对话页**：AI 交互入口。上传文件、描述需求、预览操作计划与原生语句、执行操作、查看结果和错误。
- **数据库工作台**：检查当前数据库连接情况，查看数据库实际结构与内容，提供脚本编辑执行、筛选、编辑、导出及执行记录等常规功能。

两个页面共享当前连接、选中对象和执行记录。AI 操作完成后，工作台重新读取数据库以核验实际结果。

## 首版数据库

MySQL、MongoDB、Redis、Apache Cassandra、Neo4j、InfluxDB、Elasticsearch、ClickHouse、Milvus。

按常见数据库及典型使用场景选取，不追求严格分类。九种数据库全部属于首版交付范围；具体版本、驱动、部署形态在技术设计时固定。

## 文档

- [MVP 范围与产品边界](docs/mvp-scope.md)
- [逐库能力矩阵](docs/database-capabilities.md)
- [验收标准与交付顺序](docs/acceptance.md)
- [技术设计约束与待定项](docs/technical-decisions.md)
- [Pi 接入与 Docker Compose 部署设计](docs/pi-and-deployment.md)
- [公开数据库测试数据与本地下载](fixtures/README.md)

## 技术方案

- 后端：Rust，采用 Axum + Tokio，负责数据库适配、文件导入、执行与记录。
- 前端：Vue 3 + Vite + TypeScript，两个页面的轻量 Web 应用。
- Agent：直接使用 [Pi](https://github.com/earendil-works/pi) 的 TypeScript 库，在一个薄 Node.js 服务中运行；不重写 Agent 循环。
- 部署：Docker Compose 项目网络。Rust 提供 API 和 Vue 构建产物，Pi 服务仅通过项目网络访问，保留访问模型 API 的出站能力。

## 当前可用能力

- 两个 Vue 页面：AI 对话、数据库工作台；展示真实服务健康状态与计划适配清单。
- Pi 1.4.0 Agent 循环、文本流式返回、只读能力工具回调、停止生成。
- Rust 同源 API、SSE 转发、内部工具认证、输入大小限制、单次运行互斥。
- 成功完成的对话持久化到应用卷；刷新页面及重建容器后可恢复当前会话。
- Docker 多阶段构建，两个非 root 服务，只有 app 发布本机端口。

未完成或失败的轮次不保存。当前没有会话列表，浏览器保存当前会话 ID；新建对话不会删除旧文件。单个会话上限 4 MiB、输入上限 12000 字符、单次运行约 120 秒、最多 6 次模型轮转；超限后新建对话。模型上下文尚无自动压缩。

## 项目结构

```text
server/       Rust API、流式转发与会话存储
agent/        Pi SDK 的薄 Node.js 服务
web/          Vue 前端
scripts/      冒烟测试、端到端联调、第三方声明生成
docs/         产品范围、能力矩阵、部署与开发说明
compose.yaml  一键启动
```

## 本地开发与检查

详见 [开发与验证](docs/development.md)。构建工具：Rust 1.98+、Node.js 24+。

```bash
cd web && npm ci --ignore-scripts && npm run build
cd ../agent && npm ci --ignore-scripts && npm run check && npm test
cd ../server && cargo test --locked && cargo build --locked
cd .. && node scripts/integration.mjs
```

`integration.mjs` 启动真实 Rust 与 Pi 进程，用本机测试模型 API 检查完整工具调用链、重启恢复、失败与取消，无需真实模型费用。运行中的 Compose 栈可以执行 `node scripts/smoke.mjs` 检查。

## 开发状态

- [x] 明确目标用户、页面职责与首版数据库范围。
- [x] 记录逐库能力边界与验收标准。
- [x] 确定 Rust、Vue、Pi 与 Docker Compose 的实现方向。
- [ ] 固定依赖和数据库版本，选择模型提供方。
- [x] 接通 Vue → Rust → Pi 与 Pi → Rust 能力工具链。
- [x] 提供 Docker Compose、会话持久化、健康检查和测试。
- [ ] 实现数据库连接管理、元数据浏览和原生执行框架。
- [ ] 完成九种数据库适配与真实集成验证。
- [ ] 完成 AI 对话、文件导入与操作恢复流程。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方代码与依赖遵循各自许可证，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。Pi 的原始 MIT 版权和许可文本单独保留，不以本项目版权替代。
