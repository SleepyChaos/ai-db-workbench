// Deterministic integration: actual Rust binary + Pi SDK, local test-only model API.
// No real provider credentials, model charges, or database connections are used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const data = await mkdtemp(join(tmpdir(), "workbench-integration-"));
const children = [];
let modelRequests = 0;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return server.address().port;
}
async function freePort() {
  const server = createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function start(command, args, env) {
  const child = spawn(command, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.output = "";
  child.stdout.on("data", (data) => {
    child.output += data;
  });
  child.stderr.on("data", (data) => {
    child.output += data;
  });
  children.push(child);
  return child;
}
async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
  try {
    await exit;
  } finally {
    clearTimeout(timeout);
  }
}
async function waitFor(url, child) {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error(`Service exited: ${child.output}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await sleep(100);
  }
  throw new Error(`Service timeout: ${child.output}`);
}

const model = createServer(async (req, res) => {
  const chunks = [];
  for await (const part of req) chunks.push(part);
  const request = JSON.parse(Buffer.concat(chunks).toString());
  modelRequests++;
  const user = request.messages.findLast(
    (message) => message.role === "user",
  )?.content;
  if (JSON.stringify(user).includes("TEST_ERROR")) {
    res.writeHead(401);
    res.end('{"error":{"message":"test provider rejected"}}');
    return;
  }
  if (JSON.stringify(user).includes("TEST_SLOW")) {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.flushHeaders();
    return;
  }
  res.writeHead(200, { "content-type": "text/event-stream" });
  const chunk = (delta, finish_reason = null) =>
    res.write(
      `data: ${JSON.stringify({
        id: "fixture",
        object: "chat.completion.chunk",
        created: 0,
        model: "fixture-model",
        choices: [{ index: 0, delta, finish_reason }],
      })}\n\n`,
    );
  if (request.messages.at(-1).role !== "tool") {
    chunk({
      role: "assistant",
      tool_calls: [
        {
          index: 0,
          id: `call_${modelRequests}`,
          type: "function",
          function: { name: "get_database_capabilities", arguments: "{}" },
        },
      ],
    });
    chunk({}, "tool_calls");
  } else {
    assert.ok(request.messages.at(-1).content.includes("MySQL"));
    chunk({ role: "assistant", content: "已读取 Rust 后端：" });
    chunk({ content: "9 种数据库均待实现，没有真实连接。" });
    chunk({}, "stop");
  }
  res.end("data: [DONE]\n\n");
});

try {
  const modelPort = await listen(model);
  const appPort = await freePort();
  const agentPort = await freePort();
  const base = `http://127.0.0.1:${appPort}`;
  const appEnv = {
    BIND_ADDR: `127.0.0.1:${appPort}`,
    AGENT_URL: `http://127.0.0.1:${agentPort}`,
    DATA_DIR: join(data, "sessions"),
    INTERNAL_TOKEN_FILE: join(data, "token"),
    STATIC_DIR: resolve(root, "web/dist"),
  };
  const binary = resolve(root, "server/target/debug/ai-db-workbench");
  let app = start(binary, [], appEnv);
  await waitFor(`${base}/health`, app);
  const agent = start(process.execPath, ["agent/src/server.ts"], {
    PORT: String(agentPort),
    BIND_HOST: "127.0.0.1",
    APP_URL: base,
    INTERNAL_TOKEN_FILE: join(data, "token"),
    PI_PROVIDER: "openai-compatible",
    PI_MODEL: "fixture-model",
    PI_API_KEY: "test-only-not-a-real-key",
    PI_BASE_URL: `http://127.0.0.1:${modelPort}/v1`,
  });
  await waitFor(`http://127.0.0.1:${agentPort}/health`, agent);
  const session = crypto.randomUUID();
  const request = (message, signal) =>
    fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ session_id: session, message }),
      signal,
    });
  const first = await request("查询当前支持的数据库");
  assert.equal(first.status, 200);
  const events = await first.text();
  assert.ok(events.includes("tool_start"));
  assert.ok(events.includes("tool_end"));
  assert.ok(events.includes("9 种数据库"));
  assert.ok(events.includes('"type":"done"'));
  const history = () =>
    fetch(`${base}/api/sessions/${session}`).then((r) => r.json());
  assert.equal((await history()).messages.length, 2);
  await stop(app);
  app = start(binary, [], appEnv);
  await waitFor(`${base}/health`, app);
  assert.equal((await history()).messages.length, 2);
  const resumed = await request("再检查一次");
  assert.ok((await resumed.text()).includes('"type":"done"'));
  assert.equal((await history()).messages.length, 4);
  const rejected = await request("TEST_ERROR");
  assert.ok((await rejected.text()).includes('"type":"error"'));
  assert.equal((await history()).messages.length, 4);
  const abort = new AbortController();
  const slow = await request("TEST_SLOW", abort.signal);
  assert.equal(slow.status, 200);
  const concurrent = await request("concurrent");
  assert.equal(concurrent.status, 409);
  abort.abort();
  await slow.body.cancel().catch(() => {});
  await sleep(200);
  const afterCancel = await request("取消后重试");
  assert.equal(afterCancel.status, 200);
  assert.ok((await afterCancel.text()).includes('"type":"done"'));
  assert.equal((await history()).messages.length, 6);
  console.log(
    "PASS: Rust → Pi → authenticated Rust tool → model → SSE, Chinese streaming, restart persistence, resumed context, provider error, concurrency, cancellation and retry.",
  );
} finally {
  for (const child of children) await stop(child).catch(() => {});
  model.closeAllConnections();
  model.close();
  await rm(data, { recursive: true, force: true });
}
