import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import {
  configurationError,
  runAgent,
  type Config,
  type Event,
} from "../src/runtime.ts";

test("missing model settings are reported without making requests", () => {
  assert.match(
    configurationError({
      provider: "openai-compatible",
      model: "",
      apiKey: "",
      baseUrl: "",
      appUrl: "",
      timeoutMs: 1000,
    })!,
    /PI_API_KEY/,
  );
});

test("real Pi loop calls authenticated Rust tool endpoint and streams response", async () => {
  let calls = 0;
  let toolCalls = 0;
  const server = createServer(async (req, res) => {
    if (req.url === "/api/internal/capabilities") {
      assert.equal(req.headers.authorization, "Bearer test-token");
      toolCalls++;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ connections: [], adapter_status: "planned" }));
      return;
    }
    assert.equal(req.url, "/v1/chat/completions");
    const chunks: Buffer[] = [];
    for await (const part of req) chunks.push(part);
    const request = JSON.parse(Buffer.concat(chunks).toString());
    calls++;
    res.writeHead(200, { "content-type": "text/event-stream" });
    const chunk = (delta: unknown, finish_reason: string | null = null) =>
      res.write(
        `data: ${JSON.stringify({
          id: "test-completion",
          object: "chat.completion.chunk",
          created: 0,
          model: "test-model",
          choices: [{ index: 0, delta, finish_reason }],
        })}\n\n`,
      );
    if (calls === 1) {
      assert.ok(
        request.tools.some(
          (tool: any) => tool.function.name === "get_database_capabilities",
        ),
      );
      chunk({
        role: "assistant",
        tool_calls: [
          {
            index: 0,
            id: "tool_1",
            type: "function",
            function: { name: "get_database_capabilities", arguments: "{}" },
          },
        ],
      });
      chunk({}, "tool_calls");
    } else {
      assert.ok(
        request.messages.some(
          (message: any) =>
            message.role === "tool" && message.content.includes("planned"),
        ),
      );
      chunk({ role: "assistant", content: "当前没有数据库连接。" });
      chunk({}, "stop");
    }
    res.end("data: [DONE]\n\n");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const config: Config = {
    provider: "openai-compatible",
    model: "test-model",
    apiKey: "test-key",
    baseUrl: `${base}/v1`,
    appUrl: base,
    timeoutMs: 1000,
  };
  const events: Event[] = [];
  try {
    await runAgent(
      config,
      { message: "列出连接", history: [], session_id: "test-session" },
      "test-token",
      (event) => events.push(event),
      AbortSignal.timeout(10_000),
    );
    assert.equal(calls, 2);
    assert.equal(toolCalls, 1);
    assert.ok(events.some((event) => event.type === "tool_start"));
    assert.ok(
      events.some(
        (event) => event.type === "tool_end" && event.failed === false,
      ),
    );
    assert.equal(
      events.find((event) => event.type === "delta")?.text,
      "当前没有数据库连接。",
    );
    const done = events.find((event) => event.type === "done");
    assert.equal(done?.text, "当前没有数据库连接。");
    assert.ok(Array.isArray(done?.history));
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
