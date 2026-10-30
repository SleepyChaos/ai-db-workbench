import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { timingSafeEqual } from "node:crypto";
import { configurationError, configFromEnv, runAgent } from "./runtime.ts";
import type { AgentMessage } from "@earendil-works/pi-agent-core";

const config = configFromEnv();
const tokenFile =
  process.env.INTERNAL_TOKEN_FILE || "../server/local-data/internal-token";
let busy = false;

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const part of req) {
    size += part.length;
    if (size > 4 * 1024 * 1024) throw new Error("请求内容过大。");
    chunks.push(part);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    const error = configurationError(config);
    json(res, 200, {
      status: "ok",
      service: "pi-agent",
      configured: !error,
      provider: config.provider,
      model: config.model || null,
      configuration_error: error,
    });
    return;
  }
  if (req.method !== "POST" || req.url !== "/chat") {
    json(res, 404, { error: "接口不存在。" });
    return;
  }
  let token: string;
  try {
    token = await readFile(tokenFile, "utf8");
  } catch {
    json(res, 503, { error: "Rust 服务尚未初始化内部连接。" });
    return;
  }
  const supplied = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${token}`);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    json(res, 401, { error: "内部请求认证失败。" });
    return;
  }
  const error = configurationError(config);
  if (error) {
    json(res, 503, { error });
    return;
  }
  if (busy) {
    json(res, 409, { error: "Agent 正忙。" });
    return;
  }
  let input: {
    message: string;
    history: AgentMessage[];
    session_id: string;
    run_id: string;
  };
  try {
    const parsed = (await body(req)) as Record<string, unknown>;
    if (
      !parsed ||
      typeof parsed.message !== "string" ||
      !parsed.message.trim() ||
      parsed.message.length > 24000 ||
      typeof parsed.session_id !== "string" ||
      typeof parsed.run_id !== "string" ||
      !Array.isArray(parsed.history)
    )
      throw new Error("请求格式不正确。");
    input = parsed as typeof input;
  } catch {
    json(res, 400, { error: "请求格式不正确或内容过大。" });
    return;
  }
  if (busy) {
    json(res, 409, { error: "Agent 正忙。" });
    return;
  }
  busy = true;
  res.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store",
  });
  res.flushHeaders();
  const controller = new AbortController();
  res.on("close", () => controller.abort());
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  const emit = (event: Record<string, unknown>) => {
    if (!res.destroyed && !res.writableEnded)
      res.write(JSON.stringify({ ...event, run_id: input.run_id }) + "\n");
    if (res.writableLength > 1024 * 1024) controller.abort();
  };
  try {
    emit({ type: "start" });
    await runAgent(config, input, token, emit, controller.signal);
  } catch {
    // Provider errors may contain headers or echoed request data. Do not return raw errors.
    emit({
      type: "error",
      message: controller.signal.aborted
        ? "对话已停止或超过 120 秒，本轮未保存。"
        : "模型请求或工具调用未完成，请检查模型配置、权限与网络后重试。",
    });
  } finally {
    clearTimeout(timer);
    busy = false;
    res.end();
  }
});

server.requestTimeout = 150_000;
server.listen(
  Number(process.env.PORT || 3001),
  process.env.BIND_HOST || "127.0.0.1",
  () => {
    console.log(
      "Pi bridge listening; model configured:",
      !configurationError(config),
    );
  },
);
process.on("SIGTERM", () => server.close());
