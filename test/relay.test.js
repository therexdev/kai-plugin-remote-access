"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { RemoteAccess } = require("../plugin/service/lib/relay");
const { strictFetch, waitFor, heldPoll } = require("./helpers/relay");
const hello = () => Response.json({ ok: true, tunnelId: "test", base: "https://koinosai.com/r/test/v1" });
function fixture(t, fetchImpl) {
  const settings = new Map(), events = [];
  const relay = new RemoteAccess({
    settings: { get: (key, fallback) => settings.get(key) ?? fallback, set: (key, value) => settings.set(key, value) },
    keys: { required: () => true }, localBase: () => "http://127.0.0.1:1", fetchImpl: strictFetch(fetchImpl),
    onEvent: event => events.push(event),
  });
  t.after(async () => { relay.stop(); await relay.drain(); });
  return { relay, settings, events };
}
test("a failed first handshake becomes offline and retries automatically before idle polling", { timeout: 9000 }, async t => {
  let attempts = 0, polls = 0, cancelled = 0;
  const { relay, events } = fixture(t, async (url, options) => {
    if (url.endsWith("/hello")) {
      if (++attempts === 1) return new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 503 });
      return hello();
    }
    if (++polls === 1) return new Response(null, { status: 204 });
    return heldPoll(options.signal);
  });
  await relay.start();
  await waitFor(() => relay.status().state === "offline");
  assert.equal(relay.status().base, null); assert.equal(polls, 0); assert.equal(cancelled, 1);
  await waitFor(() => relay.status().state === "connected" && polls >= 4, 7000);
  assert.equal(attempts, 2); assert.equal(relay.status().base, "https://koinosai.com/r/test/v1");
  assert.deepEqual(events.filter(e => e.type === "remote:state").map(e => e.state), ["connecting", "offline", "connected"]);
});
test("invalid hello endpoints never become connected or start polling", async t => {
  let polls = 0;
  const { relay } = fixture(t, async url => {
    if (url.endsWith("/hello")) return Response.json({ ok: true, tunnelId: "test", base: "https://untrusted.invalid/v1" });
    polls++; throw Error("Unexpected poll");
  });
  await relay.start(); await waitFor(() => relay.status().state === "offline");
  assert.equal(relay.status().base, null); assert.equal(polls, 0);
});
test("stopping a pending handshake prevents a late success from restoring remote access", async t => {
  let resolveHello;
  const { relay, settings } = fixture(t, () => new Promise(resolve => { resolveHello = resolve; }));
  await relay.start(); relay.stop(); resolveHello(hello()); await relay.drain();
  assert.equal(relay.status().state, "off"); assert.equal(relay.status().base, null);
  assert.equal(settings.get("remote.enabled"), false);
});
test("poll failures after connection are visible and response bodies are released", async t => {
  let cancelled = 0;
  const { relay } = fixture(t, async url => url.endsWith("/hello") ? hello() :
    new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 502 }));
  await relay.start(); await waitFor(() => relay.status().state === "offline");
  assert.ok(cancelled > 0);
});
test("failed response uploads are not reported as served", async t => {
  let cancelled = 0;
  const { relay, events } = fixture(t, async () => new Response(new ReadableStream({ cancel() { cancelled++; } }), { status: 503 }));
  await assert.rejects(relay._handle({ reqId: "invalid-route", method: "GET", path: "/core/wallet" }, new AbortController()), /relay answered 503/);
  assert.equal(cancelled, 1); assert.equal(events.some(e => e.type === "remote:served"), false);
});
