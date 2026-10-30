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
  assert.deepEqual(manifest.permissions, ["remote-access.read", "remote-access.control", "remote-access.keys", "remote-access.features", "desktop.preferences"]);
  assert.match(js, /window\.kai\.call\("remote\.api"/);
  assert.ok(!/fetch\(|eval\(|require\(|\.digest|remote\.token/.test(js));
  assert.match(html, /connect-src 'none'/);
  for (const id of new Set([...js.matchAll(/\$\("([^"]+)"\)/g)].map(m => m[1]))) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(js, /pagehide/); assert.match(js, /new-key-value"\)\.textContent = ""/);
});
