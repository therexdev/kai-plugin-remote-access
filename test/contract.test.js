"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.join(__dirname, "../plugin"), manifest = require("../plugin/manifest.json"), html = fs.readFileSync(path.join(root, "index.html"), "utf8"), js = fs.readFileSync(path.join(root, "app.js"), "utf8");
test("original API screen retains endpoint, privacy, keys, budgets and the remote toggle", () => {
  for (const id of ["api-snippet", "privacy-pick", "btn-new-key", "new-key-reveal", "new-key-value", "key-list", "btn-remote-toggle", "remote-info", "remote-base", "remote-state"]) assert.ok(html.includes(`id="${id}"`), id);
  for (const action of ["status", "create", "budget", "revoke", "toggle", "privacy"]) assert.ok(js.includes(`action: "${action}"`), action);
  assert.match(js, /budgetUsdMonthly/); assert.match(js, /usage/); assert.match(js, /inTok/); assert.match(js, /outTok/);
  assert.match(html, /Copy it now — it is shown only once/); assert.match(html, /while the app is/);
});
test("native broker owns network, credentials and key creation; all original controls are wired", () => {
  new vm.Script(js); assert.equal(manifest.id, "kai.remote-access");
  assert.equal(manifest.apiVersion, 3); assert.equal(manifest.runtime, "native"); assert.ok(manifest.permissions.includes("native.execute")); assert.equal(manifest.service, "service/index.js");
  assert.match(js, /window\.kai\.call\("remote\.api"/);
  assert.ok(!/fetch\(|eval\(|require\(|\.digest|remote\.token/.test(js));
  assert.match(html, /connect-src 'none'/);
  for (const id of new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1]))) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(js, /pagehide/); assert.match(js, /new-key-value"\)\.textContent = ""/);
});

test("failed connections show a retry state instead of remaining on Connecting", () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { textContent: "", setAttribute() {} });
    return elements.get(id);
  };
  const context = {
    document: { getElementById: element }, setInterval() {},
    window: { kaiLanguageReady: { then() {} }, addEventListener() {} },
    KaiI18n: { literal: value => value, setText: (target, value) => { target.textContent = value; } },
  };
  vm.runInNewContext(js + '\npaintRemote({enabled:true,state:"offline",base:null});', context);
  assert.equal(element("remote-base").textContent, "Waiting for connection…");
  assert.equal(element("remote-state").textContent, "Connection failed. Retrying koinosai.com…");
  vm.runInNewContext('paintRemote({enabled:true,state:"connected",base:"https://koinosai.com/r/test/v1"});', context);
  assert.equal(element("remote-base").textContent, "https://koinosai.com/r/test/v1");
  assert.match(element("remote-state").textContent, /^Connected/);
});
