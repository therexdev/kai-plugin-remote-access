"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { create } = require("../plugin/service");
const { validateChat } = require("../plugin/service/local-api");
function fixture(t, options = {}) {
  const data = {}, calls = [], controller = new AbortController(); let privacy = "local-only", revoked = false;
  const settings = { get(k, fallback) { if (revoked) throw Error("Revoked"); return k.split(".").reduce((o, p) => o?.[p], data) ?? fallback; }, set(k, v) { if (revoked) throw Error("Revoked"); const parts = k.split("."); let at = data; for (const p of parts.slice(0, -1)) at = at[p] ||= {}; at[parts.at(-1)] = structuredClone(v); } };
  const api = { version: 1, plugin: { id: "kai.remote-access" }, signal: controller.signal, settings,
    models: { list: () => [{ alias: "local-one", status: "ready" }, { alias: "not-installed", status: "missing" }, { alias: "koinos-network:test", status: "ready" }, { alias: "desktop:secret", status: "ready" }],
      async chat(input, signal) { calls.push({ input, signal }); if (options.chat) return options.chat(input, signal); return { object: "chat.completion", choices: [{ message: { role: "assistant", content: "Synthetic local answer" } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }; },
      async embeddings(input, signal) { calls.push({ input, signal }); return { object: "list", data: [{ object: "embedding", index: 0, embedding: [0.25, -0.5] }], model: input.model, usage: { prompt_tokens: 3, total_tokens: 3 } }; },
      async request(input, signal) { calls.push({ input, signal }); return new Response('data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: {"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } }); } },
    network: { status: () => ({ privacyMode: privacy }), configure: async ({ privacyMode }) => { privacy = privacyMode; }, fetch: async () => { throw Error("No real network in test"); } },
    desktop: { confirm: async () => options.confirm !== false, preferences: () => ({ language: "es" }) }, log() {},
  };
  class Relay {
    constructor({ settings }) { this.settings = settings; this.on = false; }
    status() { return { enabled: this.on, state: this.on ? "connected" : "off", base: this.on ? "https://synthetic.invalid/r/test/v1" : null }; }
    async start() { this.on = true; this.settings.set("remote.enabled", true); }
    stop({ persist = true } = {}) { this.on = false; if (persist) this.settings.set("remote.enabled", false); }
    async drain() {}
  }
  const service = create(api, { RemoteAccess: Relay }); t.after(() => service.dispose());
  return { service, calls, data, api, async key() { return service.call("remote.api", { action: "create", name: "Test client" }); }, revoke() { revoked = true; controller.abort(); } };
}
const auth = key => ({ authorization: "Bearer " + key.secret, "content-type": "application/json" });
test("fresh plugin owns its API credentials and serves only installed local models", async t => {
  const f = fixture(t), state = await f.service.call("remote.api", { action: "status" });
  assert.equal(state.required, true); assert.equal(state.keys.length, 0);
  assert.equal((await fetch(state.localBase + "/v1/models")).status, 401);
  const key = await f.key(), response = await fetch(state.localBase + "/v1/models", { headers: auth(key) });
  assert.deepEqual((await response.json()).data.map(m => m.id), ["local-one"]);
  const saved = JSON.stringify(f.data); assert.ok(!saved.includes(key.secret)); assert.match(saved, /digest/);
  const status = await f.service.call("remote.api", { action: "status" }); assert.ok(!JSON.stringify(status).includes("digest"));
  assert.deepEqual(await f.service.call("desktop.preferencesRead", { keys: ["kai-interface-language"] }), { "kai-interface-language": "es" });
});
test("remote callers cannot reach plugin services, private models, browser requests, or tool execution", async t => {
  const f = fixture(t), state = await f.service.startBackground(), key = await f.key();
  for (const url of ["/core/wallet", "/v1/tools", "/v1/../core/wallet", "/v1/models?path=/core"]) assert.equal((await fetch(state.localBase + url, { headers: auth(key) })).status, 404);
  assert.equal((await fetch(state.localBase + "/v1/models", { headers: { ...auth(key), origin: "https://untrusted.invalid" } })).status, 403);
  for (const input of [{ model: "not-installed", messages: [{ role: "user", content: "x" }] }, { model: "desktop:secret", messages: [{ role: "user", content: "x" }] }, { model: "local-one", messages: [{ role: "user", content: "x" }], tools: [{ type: "function" }] }]) {
    const r = await fetch(state.localBase + "/v1/chat/completions", { method: "POST", headers: auth(key), body: JSON.stringify(input) }); assert.equal(r.status, 400);
  }
  assert.equal(f.calls.length, 0);
});
test("local inference reports real token usage and supports streaming without spending credits", async t => {
  const f = fixture(t), state = await f.service.startBackground(), key = await f.key();
  const input = { model: "local-one", messages: [{ role: "user", content: "Hello" }] };
  const r = await fetch(state.localBase + "/v1/chat/completions", { method: "POST", headers: auth(key), body: JSON.stringify(input) }); assert.equal(r.status, 200); assert.equal((await r.json()).choices[0].message.content, "Synthetic local answer");
  const stream = await fetch(state.localBase + "/v1/chat/completions", { method: "POST", headers: auth(key), body: JSON.stringify({ ...input, stream: true }) }); assert.match(await stream.text(), /\[DONE\]/);
  const status = await f.service.call("remote.api", { action: "status" }); assert.deepEqual(status.keys[0].usage, { requests: 2, inTok: 9, outTok: 4, costUsd: "0.000000" });
  await f.service.call("remote.api", { action: "budget", id: key.id, budgetUsdMonthly: 0 });
  assert.equal((await f.service.call("remote.api", { action: "status" })).keys[0].budgetUsdMonthly, 0);
});
test("privacy and explicit review gate relay startup, and revoking the last key stops it", async t => {
  const f = fixture(t); await f.service.startBackground(); const key = await f.key();
  await assert.rejects(f.service.call("remote.api", { action: "toggle", enabled: true }), /Local-First/);
  await f.service.call("remote.api", { action: "privacy", privacyMode: "local-first" });
  assert.equal((await f.service.call("remote.api", { action: "toggle", enabled: true })).remote.enabled, true);
  const status = await f.service.call("remote.api", { action: "revoke", id: key.id }); assert.equal(status.remote.enabled, false); assert.equal(status.keys.length, 0);
  assert.equal((await fetch(status.localBase + "/v1/models", { headers: auth(key) })).status, 401);
});
test("revocation cancels active inference and dispose works after Core APIs are revoked", async t => {
  let entered; const ready = new Promise(r => entered = r);
  const f = fixture(t, { chat: (_input, signal) => new Promise((_resolve, reject) => { entered(); signal.addEventListener("abort", () => reject(signal.reason), { once: true }); }) });
  const state = await f.service.startBackground(), key = await f.key();
  const response = fetch(state.localBase + "/v1/chat/completions", { method: "POST", headers: auth(key), body: JSON.stringify({ model: "local-one", messages: [{ role: "user", content: "wait" }] }) }).catch(() => null);
  await ready; f.revoke(); await f.service.dispose(); await response;
  await assert.rejects(fetch(state.localBase + "/v1/models"));
});
test("text input bounds reject invalid generation controls", () => {
  const base = { model: "local", messages: [{ role: "user", content: "hello" }] }, models = [{ alias: "local" }];
  for (const change of [{ max_tokens: -1 }, { stream: "yes" }, { temperature: 9 }, { seed: 1.5 }, { top_p: 0 }, { stop: ["x", 4] }, { stream_options: { hidden: true } }]) assert.throws(() => validateChat({ ...base, ...change }, models));
});

test("embeddings use the same authenticated local boundary and report token usage", async t => {
  const f = fixture(t), state = await f.service.startBackground(), key = await f.key();
  const send = input => fetch(state.localBase + "/v1/embeddings", { method: "POST", headers: auth(key), body: JSON.stringify(input) });
  const result = await send({ model: "local-one", input: ["one", "two"], encoding_format: "float" });
  assert.equal(result.status, 200); assert.deepEqual((await result.json()).data[0].embedding, [0.25, -0.5]);
  assert.equal((await send({ model: "koinos-network:test", input: "no" })).status, 400);
  assert.equal((await send({ model: "local-one", input: { private: true } })).status, 400);
  const status = await f.service.call("remote.api", { action: "status" }); assert.equal(status.keys[0].usage.inTok, 3); assert.equal(status.keys[0].usage.requests, 1);
});
