"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { classifyModelError, modelResponseError } = require("../plugin/service/model-errors");
test("model error classification is bounded and never returns raw engine text", async () => {
  for (const [value, code] of [[{ error: { type: "context_limit" } }, "context_limit"], [{ error: { code: "model_not_found" } }, "model_not_found"], [{ error: "roles must alternate secret" }, "chat_template"], [{ message: "invalid max_tokens secret" }, "invalid_generation"], [{ code: "runtime_busy" }, "runtime_busy"]]) assert.equal(classifyModelError(value).code, code);
  let cancelled = false, pulls = 0;
  const response = new Response(new ReadableStream({ pull(c) { pulls++; c.enqueue(new TextEncoder().encode("secret".repeat(4000))); }, cancel() { cancelled = true; } }), { status: 400 });
  assert.deepEqual(await modelResponseError(response), { code: "model_rejected", source: "local_model", message: "The local model rejected the request without a recognized reason." });
  assert.equal(cancelled, true); assert.ok(pulls <= 2);
});
