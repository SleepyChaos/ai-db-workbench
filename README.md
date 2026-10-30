# AI DB Workbench

面向后端开发、运维和个人开发者的 AI 数据库工作台。

通过对话上传数据、创建数据库对象、查询和修改数据；通过数据库工作台检查连接、查看真实结构与内容，并使用原生脚本完成常规操作。

**项目状态：MVP 范围设计阶段。当前仓库只有产品与实现边界文档，尚无可运行应用，以下数据库均为计划支持。**

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

## 技术方案

- 后端：Rust，采用 Axum + Tokio，负责数据库适配、文件导入、执行与记录。
- 前端：Vue 3 + Vite + TypeScript，两个页面的轻量 Web 应用。
- Agent：直接使用 [Pi](https://github.com/earendil-works/pi) 的 TypeScript 库，在一个薄 Node.js 服务中运行；不重写 Agent 循环。
- 部署：Docker Compose 项目网络。Rust 提供 API 和 Vue 构建产物，Pi 服务仅通过项目网络访问，保留访问模型 API 的出站能力。

以上是已选定的实现方向，当前尚未提供应用代码、镜像或可运行的 Compose 配置。

## 开发状态

- [x] 明确目标用户、页面职责与首版数据库范围。
- [x] 记录逐库能力边界与验收标准。
- [x] 确定 Rust、Vue、Pi 与 Docker Compose 的实现方向。
- [ ] 固定依赖和数据库版本，选择模型提供方。
- [ ] 实现连接管理、元数据浏览和原生执行框架。
- [ ] 完成九种数据库适配与真实集成验证。
- [ ] 完成 AI 对话、文件导入与操作恢复流程。

## 许可证

本项目采用 [MIT License](LICENSE)。第三方代码与依赖遵循各自许可证，详见 [第三方声明](THIRD_PARTY_NOTICES.md)。Pi 的原始 MIT 版权和许可文本单独保留，不以本项目版权替代。
