"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), crypto = require("node:crypto");
const root = path.join(__dirname, "../plugin"), read = name => fs.readFileSync(path.join(root, name), "utf8");
function fixture(values) {
  const calls = [], context = { navigator: { languages: ["en-US"] }, window: null, document: { getElementById() { return { textContent: "", hidden: true }; } } };
  context.window = context;
  context.kai = { call: async (method, input) => { calls.push({ method, input: JSON.parse(JSON.stringify(input)) }); return values; } };
  // The original engine can run without a DOM, while the bootstrap's error UI
  // remains available separately. Native smoke covers translated real DOM.
  const document = context.document; delete context.document;
  vm.runInNewContext(read("locales/catalogs.js"), context);
  vm.runInNewContext(read("i18n.js"), context);
  vm.runInNewContext(read("language-bootstrap.js"), { window: context, KaiI18n: context.KaiI18n, document });
  return { context, calls };
}
test("the original offline localization files are preserved byte-for-byte", () => {
  const expected = { "i18n.js": "085dadabaed60ce22b587fe6746106a56c18bf381b7523418d289a4f47eec270", "locales/catalogs.js": "cc7888d38d13d74fc7628a8f0f66ac68fef00a86429afe7c93ef4b36ac49c3a6", "language.css": "7d65d88ae58eab3642411b787009ddd7956a35ee4e06956b01bb1a37f692964b" };
  for (const [name, digest] of Object.entries(expected)) assert.equal(crypto.createHash("sha256").update(read(name)).digest("hex"), digest, name);
  const html = read("index.html");
  for (const name of ["i18n.js", "locales/catalogs.js", "language.css", "language-bootstrap.js"]) assert.ok(html.includes(name), name);
  assert.ok(html.indexOf('src="language-bootstrap.js"') < html.indexOf('src="app.js"'));
});
test("each new window imports only the preserved Core language and uses the original catalogs", async () => {
  for (const [saved, normalized] of [["es-MX", "es"], ["pt_BR", "pt-BR"], ["fr", "fr"], ["de", "de"]]) {
    const f = fixture({ "kai-interface-language": saved, "unrelated-secret": "not requested" });
    await f.context.kaiLanguageReady;
    assert.deepEqual(f.calls, [{ method: "desktop.preferencesRead", input: { keys: ["kai-interface-language"] } }]);
    assert.equal(f.context.KaiI18n.language, normalized);
    for (const text of ["Your local OpenAI-compatible API", "Create key", "budget", "Save", "Cancel", "revoke", "Connecting…"]) {
      assert.equal(f.context.KaiI18n.t(text), f.context.KaiLocaleCatalogs[normalized][text] || text);
    }
    assert.notEqual(f.context.KaiI18n.t("Create key"), "Create key");
  }
  const unsupported = fixture({ "kai-interface-language": "unsupported" }); await unsupported.context.kaiLanguageReady;
  assert.equal(unsupported.context.KaiI18n.language, "en");
});
test("only original interface sinks translate; key names, secrets, endpoint and model data remain literal", () => {
  const source = read("app.js");
  for (const text of ["budget", "Save", "Cancel", "revoke"]) assert.match(source, new RegExp('KaiI18n\\.setText\\([^,]+, "' + text + '"\\)'));
  assert.match(source, /KaiI18n\.setText\(\$\("remote-state"\)/);
  assert.match(source, /left\.textContent = k\.name/);
  assert.match(source, /\$\("new-key-value"\)\.textContent = result\.secret/);
  assert.match(source, /\$\("api-snippet"\)\.textContent/);
  assert.match(source, /\$\("remote-base"\)\.textContent/);
});
