// Runs against a live Rust + Pi stack. No provider key or model charges needed.
import assert from "node:assert/strict";
const base = process.env.WORKBENCH_URL || "http://127.0.0.1:8080";
const health = await fetch(`${base}/health`);
assert.equal(health.status, 200);
const status = await fetch(`${base}/api/status`).then((r) => r.json());
assert.equal(status.backend, "ok");
assert.equal(status.agent.status, "ok");
const databases = await fetch(`${base}/api/databases`).then((r) => r.json());
assert.equal(databases.databases.length, 9);
assert.equal(databases.connections.length, 0);
assert.equal(databases.can_write, false);
assert.equal((await fetch(`${base}/api/internal/capabilities`)).status, 401);
const html = await fetch(base).then((r) => r.text());
assert.ok(html.includes('<div id="app"></div>'));
const js = html.match(/src="([^"]+\.js)"/);
assert.ok(js);
assert.equal((await fetch(new URL(js[1], base))).status, 200);
const id = crypto.randomUUID();
assert.deepEqual(
  (await fetch(`${base}/api/sessions/${id}`).then((r) => r.json())).messages,
  [],
);
const rejected = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: {
    "content-type": "application/json",
    origin: "https://untrusted.example",
  },
  body: JSON.stringify({ session_id: id, message: "test" }),
});
assert.equal(rejected.status, 403);
if (!status.agent.configured) {
  const response = await fetch(`${base}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ session_id: id, message: "hello" }),
  });
  assert.equal(response.status, 503);
  assert.ok((await response.json()).error);
}
console.log(
  "PASS: Vue assets, Rust API, Pi health, nine planned adapters, internal auth, session API, origin checks, and unconfigured-model behavior.",
);
