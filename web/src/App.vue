<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { api, chat } from "./api";

type Message = {
  role: "user" | "assistant";
  content: string;
  incomplete?: boolean;
};
type Database = { id: string; name: string; kind: string };
type Status = {
  backend: string;
  agent: {
    status: string;
    configured: boolean;
    provider?: string;
    model?: string;
    configuration_error?: string;
  };
};
const tab = ref<"chat" | "workbench">("chat");
const status = ref<Status | null>(null);
const statusError = ref("");
const databases = ref<Database[]>([]);
const messages = ref<Message[]>([]);
const input = ref("");
const error = ref("");
const busy = ref(false);
const loading = ref(true);
const tool = ref("");
const refreshing = ref(false);
const transcript = ref<HTMLElement>();
const sessionId = ref(
  localStorage.getItem("workbench.session") || crypto.randomUUID(),
);
localStorage.setItem("workbench.session", sessionId.value);
let controller: AbortController | null = null;
const ready = computed(
  () => status.value?.agent.status === "ok" && status.value.agent.configured,
);
const agentLabel = computed(() =>
  !status.value
    ? "检查中"
    : status.value.agent.status !== "ok"
      ? "服务离线"
      : ready.value
        ? "已就绪"
        : "待配置模型",
);

async function refresh() {
  refreshing.value = true;
  statusError.value = "";
  try {
    const [health, catalogue] = await Promise.all([
      api<Status>("/api/status"),
      api<{ databases: Database[] }>("/api/databases"),
    ]);
    status.value = health;
    databases.value = catalogue.databases;
  } catch (e) {
    statusError.value = e instanceof Error ? e.message : "连接失败。";
    status.value = null;
  } finally {
    refreshing.value = false;
  }
}

async function restore() {
  loading.value = true;
  try {
    const saved = await api<{ messages: Message[] }>(
      `/api/sessions/${sessionId.value}`,
    );
    messages.value = saved.messages;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "历史记录读取失败。";
  } finally {
    loading.value = false;
  }
}

function newChat() {
  if (busy.value) return;
  sessionId.value = crypto.randomUUID();
  localStorage.setItem("workbench.session", sessionId.value);
  messages.value = [];
  error.value = "";
  input.value = "";
  tool.value = "";
}

async function scroll() {
  await nextTick();
  transcript.value?.scrollTo({ top: transcript.value.scrollHeight });
}

function onEnter(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.shiftKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  event.preventDefault();
  void send();
}

async function send() {
  if (!input.value.trim() || busy.value || !ready.value || loading.value)
    return;
  const prompt = input.value.trim();
  input.value = "";
  error.value = "";
  tool.value = "";
  busy.value = true;
  messages.value = messages.value.filter((message) => !message.incomplete);
  messages.value.push({ role: "user", content: prompt });
  const responseIndex =
    messages.value.push({ role: "assistant", content: "" }) - 1;
  controller = new AbortController();
  await scroll();
  try {
    await chat(sessionId.value, prompt, controller.signal, (event) => {
      if (event.type === "delta")
        messages.value[responseIndex]!.content += event.text || "";
      if (event.type === "tool_start") tool.value = "正在读取数据库能力…";
      if (event.type === "tool_end")
        tool.value = event.failed ? "能力读取失败" : "已读取后端实际状态";
      void scroll();
    });
  } catch (e) {
    error.value = controller.signal.aborted
      ? "已停止生成，本轮不会保留到历史记录。"
      : e instanceof Error
        ? e.message
        : "对话失败。";
    messages.value[responseIndex]!.incomplete = true;
    messages.value[responseIndex - 1]!.incomplete = true;
    if (!messages.value[responseIndex]!.content)
      messages.value[responseIndex]!.content = "本轮未完成。";
    input.value = prompt;
  } finally {
    busy.value = false;
    controller = null;
    await scroll();
  }
}

onMounted(() => {
  void refresh();
  void restore();
});
onUnmounted(() => controller?.abort());
</script>

<template>
  <div class="shell">
    <aside class="sidebar">
      <a class="brand" href="/" aria-label="AI DB Workbench 首页"
        ><span class="brand-mark">DB</span
        ><span>Workbench<small>AI DATABASE TOOLS</small></span></a
      >
      <nav aria-label="主导航">
        <button :class="{ active: tab === 'chat' }" @click="tab = 'chat'">
          <span class="nav-symbol">↗</span> AI 对话
        </button>
        <button
          :class="{ active: tab === 'workbench' }"
          @click="tab = 'workbench'"
        >
          <span class="nav-symbol">▤</span> 数据库工作台
        </button>
      </nav>
      <div class="sidebar-section">
        <span>工作空间</span><small>本地 · 单用户</small>
      </div>
      <div class="connection-empty">
        <span class="status-dot muted"></span> 暂无数据库连接
      </div>
      <div class="sidebar-bottom">
        <span class="status-dot" :class="{ muted: !ready }"></span> Pi Agent
        <span>{{ agentLabel }}</span>
      </div>
    </aside>

    <main>
      <header class="topbar">
        <div class="breadcrumb">
          工作空间 <span>/</span>
          {{ tab === "chat" ? "AI 对话" : "数据库工作台" }}
        </div>
        <span class="version">v0.1 · 开发预览</span>
      </header>

      <section v-if="tab === 'chat'" class="chat-page">
        <div class="page-heading">
          <div>
            <h1>AI 对话</h1>
            <p>描述你的需求，一起处理数据库工作。</p>
          </div>
          <button
            class="secondary"
            :disabled="busy || loading"
            @click="newChat"
          >
            新建对话
          </button>
        </div>
        <div v-if="statusError" class="notice error" role="alert">
          {{ statusError }} <button @click="refresh">重试</button>
        </div>
        <div v-else-if="status && !ready" class="notice">
          <span class="status-dot amber"></span>
          <div>
            <strong>{{
              status.agent.status === "ok"
                ? "连接模型后，即可开始对话"
                : "Pi 服务暂时离线"
            }}</strong>
            <p>
              {{
                status.agent.configuration_error ||
                "请检查 agent 容器状态，然后刷新连接。"
              }}
            </p>
            <p>
              在项目 .env 中配置模型，再重建 agent 服务。<a
                href="https://github.com/SleepyChaos/ai-db-workbench#快速启动"
                target="_blank"
                rel="noreferrer"
                >查看启动说明</a
              >
            </p>
          </div>
          <button class="text-button" :disabled="refreshing" @click="refresh">
            {{ refreshing ? "检查中…" : "刷新状态" }}
          </button>
        </div>
        <div
          ref="transcript"
          class="transcript"
          aria-live="polite"
          aria-label="对话记录"
        >
          <div v-if="loading" class="empty-state"><p>正在读取对话…</p></div>
          <div v-else-if="!messages.length" class="empty-state">
            <div class="empty-mark">↗</div>
            <h2>从一个问题开始</h2>
            <p>
              与 Pi 对话，查看当前能力或讨论数据库操作。<br />数据库连接与文件导入将在后续版本开放。
            </p>
            <div class="suggestions">
              <button
                @click="
                  input =
                    '请调用工具，查看当前支持哪些数据库，以及有没有真实连接。'
                "
              >
                查看当前数据库能力 <span>↗</span></button
              ><button
                @click="
                  input =
                    '帮我起草一张 MySQL 用户表，包含邮箱、昵称和创建时间。不要执行。'
                "
              >
                起草一张 MySQL 用户表 <span>↗</span>
              </button>
            </div>
          </div>
          <article
            v-for="(message, index) in messages"
            :key="index"
            class="message"
            :class="message.role"
          >
            <div class="message-label">
              {{ message.role === "user" ? "你" : "Pi"
              }}<span v-if="message.incomplete">未保存</span>
            </div>
            <div class="message-text">
              {{ message.content || (busy ? "正在思考…" : "") }}
            </div>
          </article>
        </div>
        <div class="composer-wrap">
          <div v-if="error" class="inline-error" role="alert">{{ error }}</div>
          <div v-if="tool" class="tool-status">{{ tool }}</div>
          <form class="composer" @submit.prevent="send">
            <label class="sr-only" for="prompt">输入你的需求</label
            ><textarea
              id="prompt"
              v-model="input"
              maxlength="12000"
              rows="3"
              :disabled="busy"
              placeholder="描述需求，或先问问当前工作台能做什么…"
              @keydown.enter="onEnter"
            ></textarea>
            <div class="composer-actions">
              <span>文件导入尚未开放</span
              ><button
                v-if="busy"
                type="button"
                class="secondary"
                @click="controller?.abort()"
              >
                停止生成</button
              ><button
                v-else
                type="submit"
                class="primary"
                :disabled="!ready || !input.trim() || loading"
              >
                发送 <span>↑</span>
              </button>
            </div>
          </form>
          <p class="composer-note">
            Enter 发送 · Shift + Enter 换行 · 当前版本不会执行数据库写入
          </p>
        </div>
      </section>

      <section v-else class="workbench-page">
        <div class="page-heading">
          <div>
            <h1>数据库工作台</h1>
            <p>检查连接状态，查看真实数据库内容。</p>
          </div>
          <button class="secondary" :disabled="refreshing" @click="refresh">
            {{ refreshing ? "检查中…" : "刷新状态" }}
          </button>
        </div>
        <div v-if="statusError" class="notice error" role="alert">
          {{ statusError }}
        </div>
        <div class="service-strip">
          <div>
            <span class="status-dot" :class="{ muted: !status }"></span> Rust
            API <strong>{{ status ? "在线" : "未连接" }}</strong>
          </div>
          <div>
            <span class="status-dot" :class="{ muted: !ready }"></span> Pi Agent
            <strong>{{ agentLabel }}</strong>
          </div>
          <div>已连接数据库 <strong>0</strong></div>
        </div>
        <div class="table-heading">
          <h2>数据库适配计划</h2>
          <span>以下为计划接入，尚无实际连接</span>
        </div>
        <div class="database-table">
          <table>
            <thead>
              <tr>
                <th>数据库</th>
                <th>数据模型</th>
                <th>适配状态</th>
                <th>连接</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="database in databases" :key="database.id">
                <td>
                  <span class="database-icon">{{
                    database.name.slice(0, 2)
                  }}</span
                  ><strong>{{ database.name }}</strong>
                </td>
                <td>{{ database.kind }}</td>
                <td><span class="planned">待实现</span></td>
                <td class="muted-text">—</td>
              </tr>
              <tr v-if="!databases.length">
                <td colspan="4">
                  {{ statusError ? "暂时无法读取能力清单" : "正在读取…" }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="workbench-note">
          后续将在这里添加连接管理、结构浏览、原生脚本与数据网格。
        </p>
      </section>
    </main>
  </div>
</template>
