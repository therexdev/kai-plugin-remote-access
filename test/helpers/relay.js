"use strict";
const assert = require("node:assert/strict");
const { setTimeout: delay } = require("node:timers/promises");
// Foundation API v1 NetworkFetchOptions, not the broader native fetch options.
const strictFetch = handler => async (url, options) => {
  const unsupported = Object.keys(options).filter(key => !["method", "headers", "body", "signal"].includes(key));
  assert.deepEqual(unsupported, [], "Unsupported network options");
  return handler(url, options);
};
async function waitFor(check, timeout = 2000) {
  const end = Date.now() + timeout;
  while (!await check()) {
    assert.ok(Date.now() < end, "Timed out waiting for relay state");
    await delay(5);
  }
}
function heldPoll(signal) {
  return new Promise((_resolve, reject) => {
    if (signal.aborted) reject(signal.reason);
    else signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}
module.exports = { strictFetch, waitFor, heldPoll };
