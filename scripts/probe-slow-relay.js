"use strict";
// Explicit integration probe: real public Core SDK + hosted relay, synthetic
// local engine only. Uses disposable credentials and no user's model/account.
// node scripts/probe-slow-relay.js ../kai-core [delay-ms=140000] [local-relay-source]
const fs = require("node:fs"), path = require("node:path"), os = require("node:os"), http = require("node:http"), assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
const { createFoundationApi } = require(path.resolve(process.argv[2], "electron/foundation-api"));
const { create } = require("../plugin/service");
const { ApiKeys } = require("../plugin/service/lib/keys");
const { RemoteAccess } = require("../plugin/service/lib/relay");
const waitMs = Number(process.argv[3] || 140000);
assert.ok(Number.isSafeInteger(waitMs) && waitMs > 125000 && waitMs < 160000);
(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kai-slow-relay-")), controller = new AbortController();
  let service, networkFixture, requests = 0, activeNetwork = 0, modelAborted = false;
  const gateway = http.createServer(async (req, res) => {
    const abort = new AbortController(); res.on("close", () => { if (!res.writableEnded) { modelAborted = true; abort.abort(); } });
    try {
      assert.equal(req.url, "/core/chat/completions");
      let body = ""; for await (const bytes of req) body += bytes;
      const input = JSON.parse(body); assert.equal(input.model, "synthetic-slow-probe"); requests++;
      await delay(waitMs, undefined, { signal: abort.signal });
      res.writeHead(200, { "content-type": "text/event-stream", "x-kai-context-size": "8192" });
      res.end('data: {"choices":[{"delta":{"content":"Synthetic probe complete."},"finish_reason":"stop"}]}\n\ndata: {"usage":{"prompt_tokens":1,"completion_tokens":1}}\n\ndata: [DONE]\n\n');
    } catch { if (!res.destroyed) res.destroy(); }
  });
  try {
    if (process.argv[4]) networkFixture = await require("./relay-loopback-fixture")(process.argv[4]);
    await new Promise(resolve => gateway.listen(0, "127.0.0.1", resolve));
    const record = { manifest: { id: "kai.remote-access", version: "0.3.6", permissions: ["models.read", "inference.local", "storage.read", "storage.write", "network.status", "network.fetch"] }, root, dataDir: root, controller };
    const api = createFoundationApi({ core: {
      models: { aliases: () => [{ alias: "synthetic-slow-probe", status: "ready", contextSize: 8192, defaultContextSize: 4096, contextLimitKnown: true }] },
      gateway: { port: gateway.address().port, network: {
        status: () => ({ privacyMode: "local-first" }),
        trackShadowRequest() { activeNetwork++; let released = false; return () => { if (!released) { released = true; activeNetwork--; } }; },
      } },
    }, electron: {} }, record);
    const key = new ApiKeys(api.settings).create({ name: "Disposable slow-model probe" });
    api.settings.set("remote.enabled", true);
    service = create(api, networkFixture ? { RemoteAccess: class extends RemoteAccess {
      constructor(options) { super({ ...options, relayUrl: networkFixture.origin }); }
    } } : {});
    await service.startBackground();
    let state;
    for (let i = 0; i < 200; i++) {
      state = await service.call("remote.api", { action: "status" });
      if (state.remote.state === "connected") break;
      await delay(100);
    }
    assert.equal(state.remote.state, "connected");
    const started = Date.now();
    const url = state.remote.base + "/chat/completions";
    const response = await fetch(networkFixture ? networkFixture.publicUrl(url) : url, {
      method: "POST", headers: { authorization: `Bearer ${key.secret}`, "content-type": "application/json" },
      body: JSON.stringify({ model: "synthetic-slow-probe", messages: [{ role: "user", content: "Synthetic transport probe only." }], stream: true }),
      signal: AbortSignal.timeout(195000),
    });
    const headersMs = Date.now() - started;
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type"), /text\/event-stream/);
    let text = "", firstByteMs = null;
    for await (const bytes of response.body) { firstByteMs ??= Date.now() - started; text += Buffer.from(bytes).toString("utf8"); }
    const elapsedMs = Date.now() - started;
    assert.ok(firstByteMs < 30000, `First byte took ${firstByteMs}ms`);
    assert.ok(elapsedMs >= waitMs && elapsedMs < 170000);
    assert.match(text, /"kai_context":\{"contextSize":8192,"verified":true\}/);
    assert.match(text, /Synthetic probe complete/); assert.ok(text.endsWith("data: [DONE]\n\n"));
    assert.equal(requests, 1); assert.equal(modelAborted, false);
    const beats = text.match(/: kai-keepalive/g)?.length || 0; assert.ok(beats >= 8);
    await service.dispose(); service = null; assert.equal(activeNetwork, 0);
    if (networkFixture) assert.equal(networkFixture.idleTimeouts, 0);
    console.log(JSON.stringify({ ok: true, hostedRelay: !networkFixture, loopbackRelayAndIdleProxy: !!networkFixture, realCorePublicSdk: true, syntheticEngine: true, realModelOrGoogleAction: false, headersMs, firstByteMs, elapsedMs, heartbeats: beats, modelRequests: requests, contextSize: 8192, activeNetworkAfterStop: activeNetwork }, null, 2));
  } finally {
    await service?.dispose(); controller.abort();
    await networkFixture?.stop();
    gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
