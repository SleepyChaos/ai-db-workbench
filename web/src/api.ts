export async function api<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error("无法连接后端，请刷新后重试。");
  return response.json();
}

export type StreamEvent = {
  type: string;
  text?: string;
  message?: string;
  tool?: string;
  failed?: boolean;
};

export async function chat(
  sessionId: string,
  message: string,
  signal: AbortSignal,
  onEvent: (event: StreamEvent) => void,
) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
    signal,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "对话请求失败。");
  }
  if (!response.body) throw new Error("浏览器无法接收流式响应。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let finished = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let end: number;
      while ((end = pending.indexOf("\n\n")) >= 0) {
        const block = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const event = JSON.parse(data) as StreamEvent;
        if (event.type === "error")
          throw new Error(event.message || "对话未完成。");
        if (event.type === "done") finished = true;
        onEvent(event);
      }
    }
    if (!finished) throw new Error("连接中断，本轮未完成。");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
