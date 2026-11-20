"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { createLocalApi } = require("../plugin/service/local-api");
const { HEARTBEAT_MS, REMOTE_DEADLINE_MS, LOCAL_DEADLINE_MS } = require("../plugin/service/stream-output");
const { waitFor } = require("./helpers/relay");
const answer = 'data: {"choices":[{"delta":{"content":"hello"},"finish_reason":"stop"}]}\n\ndata: {"usage":{"prompt_tokens":2,"completion_tokens":1}}\n\ndata: [DONE]\n\n';
async function fixture(t, request, options = {}) {
  const owner = new AbortController(), calls = [], usage = [];
  const settings = new Map(); let valid = true;
  const keys = { verify: token => valid && token === "test-key" ? { id: "test" } : null, recordUsage: (...v) => usage.push(v) };
  const api = { signal: owner.signal, settings: { get: (k, f) => settings.get(k) ?? f, set: (k, v) => settings.set(k, v) }, models: {
    list: () => [{ alias: "local", status: "ready" }],
    request: (input, signal) => { calls.push({ input, signal }); return request(signal); },
  } };
  const local = createLocalApi({ api, keys, heartbeatMs: 15, ...options }); await local.start();
  t.after(() => local.stop());
  const post = (extra = {}) => fetch(local.base + "/v1/chat/completions", {
    method: "POST", headers: { authorization: "Bearer test-key", "content-type": "application/json", ...extra.headers },
    body: JSON.stringify({ model: "local", messages: [{ role: "user", content: "synthetic" }], stream: true, ...extra.input }), signal: extra.signal,
  });
  return { local, post, calls, usage, owner, revoke() { valid = false; local.cancelRequests(); } };
}
test("slow model headers produce keep-alives before the answer and verified late context", async t => {
  let resolve; const ready = new Promise(r => resolve = r);
  const f = await fixture(t, () => ready);
  const response = await f.post(), reader = response.body.getReader();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-kai-context-size"), null);
  const first = new TextDecoder().decode((await reader.read()).value);
  assert.match(first, /^(?:: kai-keepalive\n\n)+$/); assert.equal(f.usage.length, 0);
  resolve(new Response(answer, { headers: { "x-kai-context-size": "8192" } }));
  let text = first; for (;;) { const next = await reader.read(); if (next.done) break; text += new TextDecoder().decode(next.value); }
  assert.match(text, /"kai_context":\{"contextSize":8192,"verified":true\}/);
  assert.ok(text.endsWith(answer)); assert.equal(f.calls.length, 1);
  assert.deepEqual(f.usage, [["test", { inTok: 2, outTok: 1, costMicro: 0 }]]);
});
test("heartbeats cannot split a JSON frame or a UTF-8 character during generation", async t => {
  let enqueue, finish;
  const bytes = Buffer.from('data: {"choices":[{"delta":{"content":"🌍"}}]}\r\n\r\ndata: [DONE]\r\n\r\n');
  const f = await fixture(t, () => new Response(new ReadableStream({ start(c) { enqueue = x => c.enqueue(x); finish = () => c.close(); } }), { headers: { "x-kai-context-size": "4096" } }));
  const pending = f.post(); await waitFor(() => enqueue);
  const split = bytes.indexOf(Buffer.from("🌍")) + 2; enqueue(bytes.subarray(0, split));
  const response = await pending, reader = response.body.getReader();
  assert.match(new TextDecoder().decode((await reader.read()).value), /^(?:: kai-keepalive\n\n)+$/);
  enqueue(bytes.subarray(split)); finish();
  let output = ""; for (;;) { const value = await reader.read(); if (value.done) break; output += new TextDecoder().decode(value.value); }
  assert.equal(output.replace(/: kai-keepalive\n\n/g, ""), bytes.toString());
  assert.equal(response.headers.get("x-kai-context-size"), "4096");
});
test("fast model rejection keeps HTTP status; slow rejection is a safe SSE error without DONE", async t => {
  let release; const delayed = new Promise(r => release = r);
  let slow = false;
  const rejection = () => Response.json({ error: { message: "context window exceeded /private/prompt secret" } }, { status: 400 });
  const f = await fixture(t, () => slow ? delayed : rejection());
  let response = await f.post(); assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "context_limit");
  slow = true; response = await f.post(); release(rejection());
  const body = await response.text(); assert.equal(response.status, 200);
  assert.match(body, /data: \{"error":/); assert.match(body, /"status":400/); assert.match(body, /context_limit/);
  assert.doesNotMatch(body, /\[DONE\]|private|secret/); assert.equal(f.calls.length, 2); assert.equal(f.usage.length, 0);
});
test("validation and authentication do not start streaming or call the model", async t => {
  const f = await fixture(t, () => { throw Error("must not run"); });
  for (const [extra, status] of [[{ input: { tools: [] } }, 400], [{ headers: { authorization: "Bearer wrong" } }, 401]]) {
    const response = await f.post(extra); assert.equal(response.status, status);
    assert.equal(response.headers.get("content-type"), "application/json"); assert.doesNotMatch(await response.text(), /keepalive/);
  }
  assert.equal(f.calls.length, 0);
});
test("a remote deadline aborts slow inference and sends an explicit timeout without replay", async t => {
  const f = await fixture(t, signal => delay(10000, null, { signal }), { remoteDeadlineMs: 90 });
  const response = await f.post({ headers: { "x-kai-remote-access": "1" } });
  const body = await response.text(); assert.match(body, /"status":504/); assert.match(body, /request_timeout/);
  assert.doesNotMatch(body, /\[DONE\]/); assert.equal(f.calls.length, 1); assert.equal(f.calls[0].signal.aborted, true); assert.equal(f.usage.length, 0);
});
for (const kind of ["disconnect", "revoke", "owner shutdown"]) test(`${kind} cancels slow inference after a heartbeat`, async t => {
  const f = await fixture(t, signal => delay(10000, null, { signal }));
  const response = await f.post(); const reader = response.body.getReader(); await reader.read();
  if (kind === "disconnect") await reader.cancel();
  else { if (kind === "revoke") f.revoke(); else f.owner.abort();
    let body = ""; for (;;) { const next = await reader.read(); if (next.done) break; body += new TextDecoder().decode(next.value); }
    assert.match(body, /data: \{"error":/); assert.doesNotMatch(body, /\[DONE\]/);
  }
  await waitFor(() => f.calls[0].signal.aborted); assert.equal(f.calls.length, 1); assert.equal(f.usage.length, 0);
});
test("an incomplete upstream frame is discarded before a well-formed error event", async t => {
  const f = await fixture(t, () => new Response('data: {"choices":['));
  const response = await f.post(), body = await response.text();
  assert.match(body, /^data: \{"error":/); assert.doesNotMatch(body, /choices|\[DONE\]/); assert.equal(f.usage.length, 0);
});
test("production timing fits the existing Core network bound with headroom", () => {
  assert.equal(HEARTBEAT_MS, 15000); assert.equal(REMOTE_DEADLINE_MS, 170000);
  assert.ok(REMOTE_DEADLINE_MS + 5000 < 180000); assert.equal(LOCAL_DEADLINE_MS, 240000);
});
