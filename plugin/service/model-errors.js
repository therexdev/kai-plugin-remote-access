"use strict";

// Classify bounded engine errors; never forward prompts, file paths or keys.
const messages = {
  context_limit: "The local model rejected the context window. Check the model's allowed context in KAI Core.",
  chat_template: "The local model rejected the chat template or message roles.",
  model_not_found: "The selected local model is unavailable. Reload models and select an installed model.",
  memory_exhausted: "The local model could not allocate enough RAM or GPU memory. Close other model work or lower the allowed context in KAI Core.",
  runtime_busy: "The local model is busy. Wait for its current request to finish.",
  invalid_generation: "The local model rejected a generation parameter.",
  model_rejected: "The local model rejected the request without a recognized reason.",
};
function classifyModelError(value) {
  const error = value?.error ?? value;
  const text = (typeof error === "string" ? error : `${error?.code || ""} ${error?.type || ""} ${error?.message || ""}`).toLowerCase();
  const code = /out of memory|not enough memory|failed to allocate|cannot allocate|cuda.*alloc|memory_exhausted/.test(text) ? "memory_exhausted"
    : /context[_ ](?:length|limit|size|window)|exceed.*context|too many tokens|prompt is|n_ctx|context_tokens/.test(text) ? "context_limit"
    : /chat[_ ]template|roles must alternate|system role|jinja/.test(text) ? "chat_template"
    : /model_not_found|unknown model|model.*not found|installed local model/.test(text) ? "model_not_found"
    : /runtime_busy|model is busy/.test(text) ? "runtime_busy"
    : /max_tokens|max_completion_tokens|temperature|top_p|stream_options|invalid_generation/.test(text) ? "invalid_generation"
    : "model_rejected";
  return { code, message: messages[code], source: "local_model" };
}
async function modelResponseError(response) {
  const reader = response.body?.getReader();
  let text = "", bytes = 0;
  const decoder = new TextDecoder();
  try {
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      const remaining = 16384 - bytes;
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      bytes += value.byteLength;
      if (bytes >= 16384) break;
    }
    text += decoder.decode();
  } catch { /* The original HTTP status remains useful if the body is unreadable. */ }
  finally { await reader?.cancel().catch(() => {}); }
  try { return classifyModelError(JSON.parse(text)); }
  catch { return classifyModelError(text); }
}
module.exports = { classifyModelError, modelResponseError };
