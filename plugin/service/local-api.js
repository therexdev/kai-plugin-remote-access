"use strict";
const http = require("node:http");
const { once } = require("node:events");
const MAX_BODY = 128 * 1024;
function validateChat(value, models) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !["model", "messages", "stream", "max_tokens", "max_completion_tokens", "temperature", "top_p", "stop", "seed", "stream_options"].includes(k))) throw Error("Only local text chat is supported; tools and private application features are not exposed.");
  if (typeof value.model !== "string" || !models.some(m => m.alias === value.model)) throw Error("Choose an installed local model.");
  if (!Array.isArray(value.messages) || !value.messages.length || value.messages.length > 256 || value.messages.some(m => !m || Object.keys(m).some(k => !["role", "content"].includes(k)) || !["system", "developer", "user", "assistant"].includes(m.role) || typeof m.content !== "string")) throw Error("Use text messages with supported roles.");
  const max = value.max_completion_tokens ?? value.max_tokens ?? 1024;
  if (!Number.isSafeInteger(max) || max < 1 || max > 32768) throw Error("Choose an output limit from 1 to 32,768 tokens.");
  if (value.stream !== undefined && typeof value.stream !== "boolean") throw Error("stream must be true or false.");
  if (value.temperature !== undefined && (!Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2)) throw Error("Invalid temperature.");
  if (value.top_p !== undefined && (!Number.isFinite(value.top_p) || value.top_p <= 0 || value.top_p > 1)) throw Error("Invalid top_p.");
  if (value.seed !== undefined && !Number.isSafeInteger(value.seed)) throw Error("Invalid seed.");
  if (value.stop !== undefined && !(typeof value.stop === "string" && value.stop.length <= 256 || Array.isArray(value.stop) && value.stop.length <= 4 && value.stop.every(s => typeof s === "string" && s.length <= 256))) throw Error("Invalid stop sequence.");
  if (value.stream_options !== undefined && (!value.stream_options || Object.keys(value.stream_options).some(k => k !== "include_usage") || typeof value.stream_options.include_usage !== "boolean")) throw Error("Invalid stream options.");
  return { ...structuredClone(value), max_tokens: max };
}
function validateEmbedding(value, models) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !["model", "input", "encoding_format", "dimensions", "user"].includes(k))) throw Error("Use a local embedding request.");
  if (typeof value.model !== "string" || !models.some(m => m.alias === value.model)) throw Error("Choose an installed local model.");
  const tokenList = v => Array.isArray(v) && v.length > 0 && v.length <= 32768 && v.every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647);
  const valid = typeof value.input === "string" || tokenList(value.input) || Array.isArray(value.input) && value.input.length > 0 && value.input.length <= 256 && (value.input.every(v => typeof v === "string") || value.input.every(tokenList));
  if (!valid) throw Error("Embedding input must be text, text batches, or token IDs.");
  if (value.encoding_format !== undefined && !["float", "base64"].includes(value.encoding_format)) throw Error("Choose float or base64 embedding output.");
  if (value.dimensions !== undefined && (!Number.isSafeInteger(value.dimensions) || value.dimensions < 1 || value.dimensions > 65536)) throw Error("Invalid embedding dimensions.");
  if (value.user !== undefined && (typeof value.user !== "string" || value.user.length > 200)) throw Error("Invalid embedding user label.");
  return structuredClone(value);
}
function createLocalApi({ api, keys, onError = () => {} }) {
  let server, port = 0, closed = false;
  const pending = new Set(), sockets = new Set(), rates = new Map();
  const models = () => api.models.list().filter(m => m.status === "ready" && !/^(desktop:|koinos-network)/.test(m.alias));
  const fail = (res, status, message) => { if (!res.headersSent) res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify({ error: { message, type: "remote_access_error" } })); };
  async function route(req, res) {
    if (closed || api.signal.aborted) return fail(res, 503, "Remote Access is closing.");
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin) return fail(res, 403, "This API accepts native loopback clients only.");
    if (!((req.method === "GET" && req.url === "/v1/models") || (req.method === "POST" && ["/v1/chat/completions", "/v1/embeddings"].includes(req.url)))) return fail(res, 404, "This endpoint is not available.");
    const auth = req.headers.authorization;
    const key = typeof auth === "string" && /^Bearer [A-Za-z0-9_-]{1,200}$/.test(auth) ? keys.verify(auth.slice(7)) : null;
    if (!key) return fail(res, 401, "A valid Remote Access API key is required.");
    const now = Date.now(), recent = (rates.get(key.id) || []).filter(t => now - t < 60000);
    if (recent.length >= 60 || pending.size >= 4) return fail(res, 429, "Remote Access request limit reached. Try again shortly.");
    recent.push(now); rates.set(key.id, recent);
    if (req.method === "GET") { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); return res.end(JSON.stringify({ object: "list", data: models().map(m => ({ id: m.alias, object: "model", owned_by: "local" })) })); }
    const controller = new AbortController(); pending.add(controller);
    const cancel = () => { if (!res.writableEnded) controller.abort(Error("API client disconnected")); };
    res.once("close", cancel);
    try {
      let size = 0; const chunks = [];
      for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) return fail(res, 413, "Request body exceeds 128 KB."); chunks.push(chunk); }
      let input;
      try { input = (req.url === "/v1/embeddings" ? validateEmbedding : validateChat)(JSON.parse(Buffer.concat(chunks).toString("utf8")), models()); }
      catch (error) { return fail(res, 400, error instanceof SyntaxError ? "Invalid JSON." : error.message); }
      const signal = AbortSignal.any([api.signal, controller.signal, AbortSignal.timeout(240000)]);
      let usage = null;
      if (input.stream) {
        const response = await api.models.request({ ...input, stream_options: { include_usage: true } }, signal);
        if (!response.ok) return fail(res, response.status >= 400 && response.status <= 599 ? response.status : 502, "Local model request failed.");
        if (!keys.verify(auth.slice(7))) return fail(res, 401, "The API key was revoked.");
        res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-store" });
        let parse = ""; const decoder = new TextDecoder();
        for await (const chunk of response.body || []) {
          signal.throwIfAborted(); if (!keys.verify(auth.slice(7))) throw Error("The API key was revoked.");
          parse += decoder.decode(chunk, { stream: true });
          const lines = parse.split("\n"); parse = lines.pop();
          for (const line of lines) if (line.startsWith("data: ") && line.slice(6) !== "[DONE]") { try { const value = JSON.parse(line.slice(6)); if (value.usage) usage = value.usage; } catch {} }
          if (parse.length > 1048576) throw Error("Invalid model stream.");
          if (!res.write(Buffer.from(chunk))) await once(res, "drain", { signal });
        }
        res.end();
      } else {
        const result = await (req.url === "/v1/embeddings" ? api.models.embeddings(input, signal) : api.models.chat(input, signal)); signal.throwIfAborted();
        if (!keys.verify(auth.slice(7))) return fail(res, 401, "The API key was revoked.");
        usage = result.usage;
        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(result));
      }
      keys.recordUsage(key.id, { inTok: usage?.prompt_tokens || 0, outTok: usage?.completion_tokens || 0, costMicro: 0 });
    } catch (error) { if (!res.writableEnded && !res.destroyed) fail(res, 503, controller.signal.aborted ? "Request stopped." : "The local model is unavailable."); onError(error); }
    finally { pending.delete(controller); res.off("close", cancel); }
  }
  return {
    models,
    get base() { return port ? `http://127.0.0.1:${port}` : null; },
    async start() {
      if (server) return this.base;
      if (closed) throw Error("Remote Access is closing.");
      server = http.createServer((req, res) => { void route(req, res).catch(error => { fail(res, 500, "API request failed."); onError(error); }); });
      server.requestTimeout = 250000; server.headersTimeout = 10000; server.maxHeadersCount = 40;
      server.on("connection", socket => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });
      const saved = api.settings.get("localPort", 0), preferred = Number.isSafeInteger(saved) && saved >= 1024 && saved <= 65535 ? saved : 0;
      const listen = p => new Promise((resolve, reject) => { const onError = error => { server.off("listening", resolve); reject(error); }; server.once("error", onError); server.once("listening", () => { server.off("error", onError); resolve(); }); server.listen(p, "127.0.0.1"); });
      try { await listen(preferred); } catch (error) { if (error.code !== "EADDRINUSE" || !preferred) throw error; await listen(0); }
      port = server.address().port; api.settings.set("localPort", port); return this.base;
    },
    cancelRequests() { for (const controller of pending) controller.abort(Error("API access changed")); },
    async stop() { closed = true; this.cancelRequests(); for (const socket of sockets) socket.destroy(); const current = server; server = null; port = 0; if (current) await new Promise(resolve => current.close(resolve)); },
  };
}
module.exports = { createLocalApi, validateChat, validateEmbedding };
