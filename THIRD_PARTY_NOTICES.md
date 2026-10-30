# Third-party notices

本项目自身采用 MIT。第三方组件的版权与许可独立保留。

当前骨架已安装并锁定 Pi、Vue 与 Rust 依赖。下面列出主要组件；Docker 构建同时收集已安装 npm 包以及已下载 Rust crates 的原始许可证/NOTICE 文本，保存在镜像 /app/licenses 下。

## Pi

- 上游：https://github.com/earendil-works/pi
- 历史项目名：badlogic/pi-mono
- 已使用（1.4.0）：`@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`
- 许可证：MIT
- 原始版权：Copyright (c) 2025 Mario Zechner
- 原始文本：[LICENSES/pi-MIT.txt](LICENSES/pi-MIT.txt)
- 核对日期：2026-10-30
- 核对来源：https://github.com/earendil-works/pi/blob/main/LICENSE
- GitHub 返回的 LICENSE 文件 blob SHA：`b0a8e9b81083294360c69b4ec45d3d39a2b28197`

复制或随应用、容器镜像分发 Pi 代码时，保留其原始版权与完整许可证。不要仅保留项目链接或以本项目的 MIT 版权声明替代上游声明。

## 其他直接组件与生成声明

- Vue 3.5.44：MIT；原始文本随前端构建收集到 web-notices.txt。
- Axum、Tokio、Serde 等 Rust 依赖：以 server/Cargo.lock 和各 crate 原始许可证为准。
- Pi 及 Node 传递依赖：以 agent/package-lock.json 为准，生成 npm-notices.txt。
- scripts/npm-notices.mjs 收集已安装包的 LICENSE、COPYING、NOTICE、COPYRIGHT；没有独立文件时保留 README 与包声明。
- Rust 构建阶段收集 registry 源码中的许可证、版权和 NOTICE，随最终 app 镜像提供。
- 基础镜像自己的版权信息保留在其系统目录；目标数据库服务器的许可证不被本项目 MIT 许可证覆盖。

依赖升级或增加随附组件时，同步更新锁文件与声明。
