"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const root = path.join(__dirname, "../plugin"), read = name => fs.readFileSync(path.join(root, name), "utf8");
test("original translation catalogs are retained while the shared Core adapter loads before the UI", () => {
  const digest = crypto.createHash("sha256").update(read("locales/catalogs.js")).digest("hex");
  assert.equal(digest, "cc7888d38d13d74fc7628a8f0f66ac68fef00a86429afe7c93ef4b36ac49c3a6");
  const html = read("index.html");
  assert.ok(html.indexOf('src="core-language.js"') < html.indexOf('src="app.js"'));
  assert.ok(!html.includes('src="language-bootstrap.js"'));
});
test("only original interface sinks translate; key names, secrets, endpoint and model data remain literal", () => {
  const source = read("app.js");
  for (const text of ["budget", "Save", "Cancel", "revoke"]) assert.match(source, new RegExp('KaiI18n\\.setText\\([^,]+, "' + text + '"\\)'));
  assert.match(source, /KaiI18n\.setText\(\$\("remote-state"\)/);
  assert.match(source, /left\.textContent = k\.name/);
  assert.match(source, /\$\("new-key-value"\)\.textContent = result\.secret/);
  assert.match(source, /\$\("api-snippet"\)\.textContent/);
  assert.match(source, /KaiI18n\.setText\(\$\("remote-base"\), remote\.base \? KaiI18n\.literal\(remote\.base\)/);
});
