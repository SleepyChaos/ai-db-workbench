import {
  Agent,
  type AgentMessage,
  type StreamFn,
} from "@earendil-works/pi-agent-core";
import { createModels, type Model } from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { anthropicProvider } from "@earendil-works/pi-ai/providers/anthropic";
import { streamSimple } from "@earendil-works/pi-ai/api/openai-completions";
import { Type } from "typebox";

export type Event = Record<string, unknown>;
export type Config = {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl: string;
  appUrl: string;
  timeoutMs: number;
};

export function configFromEnv(env = process.env): Config {
  return {
    provider: env.PI_PROVIDER || "openai-compatible",
    model: env.PI_MODEL || "",
    apiKey: env.PI_API_KEY || "",
    baseUrl: env.PI_BASE_URL || "",
    appUrl: env.APP_URL || "http://127.0.0.1:8080",
    timeoutMs: 120_000,
  };
}

function modelRuntime(config: Config): {
  model: Model<any>;
  streamFn: StreamFn;
} {
  if (!config.apiKey || !config.model)
    throw new Error("请配置 PI_API_KEY 和 PI_MODEL。");
  if (config.provider === "openai-compatible") {
    if (!config.baseUrl)
      throw new Error("OpenAI 兼容接口需要 PI_BASE_URL（通常以 /v1 结尾）。");
    const url = new URL(config.baseUrl);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new Error("PI_BASE_URL 必须是无内嵌凭据的 HTTP(S) 地址。");
    }
    const model: Model<"openai-completions"> = {
      id: config.model,
      name: config.model,
      provider: "workbench",
      api: "openai-completions",
      baseUrl: config.baseUrl,
      reasoning: false,
      input: ["text"],
      contextWindow: 32_768,
      maxTokens: 4096,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      compat: { supportsStore: false },
    };
    return {
      model,
      streamFn: (m, context, options) =>
        streamSimple(m as Model<"openai-completions">, context, options),
    };
  }
  const models = createModels();
  if (config.provider === "openai") models.setProvider(openaiProvider());
  else if (config.provider === "anthropic")
    models.setProvider(anthropicProvider());
  else
    throw new Error(
      "PI_PROVIDER 目前支持 openai-compatible、openai、anthropic。",
    );
  const model = models.getModel(config.provider, config.model);
  if (!model)
    throw new Error(
      "PI_MODEL 不在当前 Pi 模型目录中，请检查名称或使用兼容接口。",
    );
  if (config.baseUrl) model.baseUrl = config.baseUrl;
  return { model, streamFn: models.streamSimple.bind(models) };
}

export function configurationError(config: Config): string | null {
  try {
    modelRuntime(config);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "模型配置无效。";
  }
}

export async function runAgent(
  config: Config,
  input: { message: string; history: AgentMessage[]; session_id: string },
  token: string,
  emit: (event: Event) => void,
  signal: AbortSignal,
): Promise<void> {
  const runtime = modelRuntime(config);
  let turns = 0;
  let lastError = false;
  const agent = new Agent({
    initialState: {
      model: runtime.model,
      systemPrompt:
        "你是 AI DB Workbench 的数据库助手，面向开发者。当前是骨架阶段。查询数据库支持、连接情况时先调用 get_database_capabilities 工具。数据库驱动尚未实现，不能声称执行了查询、导入或写入。可以解释和起草 SQL，但必须说明尚未执行。中文简洁回答。",
      tools: [
        {
          name: "get_database_capabilities",
          label: "读取数据库能力",
          description: "从 Rust 后端读取真实的数据库适配状态和连接列表。只读。",
          parameters: Type.Object({}),
          execute: async (_id, _params, toolSignal) => {
            const response = await fetch(
              `${config.appUrl}/api/internal/capabilities`,
              {
                headers: { authorization: `Bearer ${token}` },
                signal: AbortSignal.any([
                  signal,
                  toolSignal ?? signal,
                  AbortSignal.timeout(5000),
                ]),
              },
            );
            if (!response.ok) throw new Error("Rust 能力接口不可用。");
            const data = await response.json();
            return {
              content: [{ type: "text", text: JSON.stringify(data) }],
              details: data,
            };
          },
        },
      ],
    },
    streamFn: runtime.streamFn,
    getApiKey: () => config.apiKey,
    sessionId: input.session_id,
    toolExecution: "sequential",
    finishTurn: () => (++turns >= 6 ? { action: "end" } : undefined),
  });
  if (input.history.length) agent.state.messages = input.history;
  const abort = () => agent.abort();
  signal.addEventListener("abort", abort, { once: true });
  const unsubscribe = agent.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent.type === "text_delta"
    ) {
      emit({ type: "delta", text: event.assistantMessageEvent.delta });
    } else if (event.type === "tool_execution_start") {
      emit({
        type: "tool_start",
        tool: event.toolName,
        tool_call_id: event.toolCallId,
      });
    } else if (event.type === "tool_execution_end") {
      emit({
        type: "tool_end",
        tool: event.toolName,
        tool_call_id: event.toolCallId,
        failed: event.isError,
      });
    } else if (
      event.type === "message_end" &&
      event.message.role === "assistant"
    ) {
      lastError = ["error", "aborted"].includes(event.message.stopReason);
    }
  });
  try {
    signal.throwIfAborted();
    await agent.prompt(input.message);
    signal.throwIfAborted();
    if (lastError || agent.state.errorMessage)
      throw new Error("MODEL_REQUEST_FAILED");
    const final = agent.state.messages.findLast(
      (message) => message.role === "assistant",
    );
    if (
      !final ||
      final.role !== "assistant" ||
      final.stopReason === "toolUse"
    ) {
      throw new Error("TOOL_LIMIT_REACHED");
    }
    const text = final.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
    emit({ type: "done", text, history: agent.state.messages });
  } finally {
    unsubscribe();
    signal.removeEventListener("abort", abort);
  }
}
