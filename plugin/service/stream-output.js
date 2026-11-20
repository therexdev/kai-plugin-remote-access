"use strict";
const { once } = require("node:events");

const HEARTBEAT_MS = 15000;
const LOCAL_DEADLINE_MS = 240000;
// Core 0.7.32 bounds public network requests (including relay uploads) at
// 180 seconds. Finish with a useful error before that outer bound expires.
const REMOTE_DEADLINE_MS = 170000;
const MAX_FRAME_CHARS = 1024 * 1024;

function streamOutput(res, signal, heartbeatMs = HEARTBEAT_MS) {
  let pending = "";
  const decoder = new TextDecoder();
  const start = context => {
    if (res.headersSent) return;
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-store, no-transform");
    if (context) res.setHeader("x-kai-context-size", String(context));
    res.writeHead(200);
  };
  const write = async text => {
    signal.throwIfAborted();
    start();
    if (!res.write(text)) await once(res, "drain", { signal });
  };
  // Comments carry no generated content or completion claim. Only complete
  // upstream frames are written below, so a heartbeat cannot split JSON.
  const timer = setInterval(() => {
    if (signal.aborted || res.destroyed || res.writableEnded || res.writableNeedDrain) return;
    start();
    res.write(": kai-keepalive\n\n");
  }, heartbeatMs);
  timer.unref();
  const stop = () => { clearInterval(timer); signal.removeEventListener("abort", stop); res.off("close", stop); };
  signal.addEventListener("abort", stop, { once: true });
  res.once("close", stop);
  return {
    stop,
    async context(value) {
      const early = !res.headersSent;
      start(value);
      // The allocation may become known after a keep-alive committed headers.
      // Preserve the same verified metadata contract as non-streaming Core.
      if (value && !early) await write(`data: ${JSON.stringify({ kai_context: { contextSize: value, verified: true } })}\n\n`);
    },
    async forward(body, onUsage) {
      for await (const chunk of body || []) {
        signal.throwIfAborted();
        pending += decoder.decode(chunk, { stream: true });
        let boundary;
        while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(pending))) {
          const end = boundary.index + boundary[0].length;
          if (end > MAX_FRAME_CHARS) throw Error("Invalid model stream.");
          const frame = pending.slice(0, end); pending = pending.slice(end);
          const data = frame.split(/\r\n|\n|\r/).filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).replace(/^ /, "")).join("\n");
          try { const value = JSON.parse(data); if (value.usage) onUsage(value.usage); } catch {}
          await write(frame);
        }
        if (pending.length > MAX_FRAME_CHARS) throw Error("Invalid model stream.");
      }
      pending += decoder.decode();
      if (pending.trim()) throw Error("Incomplete model stream.");
      signal.throwIfAborted();
    },
  };
}
module.exports = { streamOutput, HEARTBEAT_MS, LOCAL_DEADLINE_MS, REMOTE_DEADLINE_MS };
