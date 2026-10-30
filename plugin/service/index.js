"use strict";
const { ApiKeys } = require("./lib/keys");
const { RemoteAccess } = require("./lib/relay");
const { createLocalApi } = require("./local-api");

function create(api, dependencies = {}) {
  if (api.version !== 1) throw Error("Remote Access requires Foundation API v1");
  const keys = new ApiKeys(api.settings);
  const local = createLocalApi({ api, keys, onError: error => { try { api.log?.("warn", String(error.message || error).slice(0, 300)); } catch {} } });
  let closed = false, opening = null, busy = false, disposing = null;
  const active = signal => { api.signal.throwIfAborted(); signal?.throwIfAborted(); if (closed) throw Error("Remote Access is closing."); };
  const mode = () => api.network.status().privacyMode;
  const ensure = () => opening ||= local.start();
  const relay = new (dependencies.RemoteAccess || RemoteAccess)({
    relayUrl: "https://koinosai.com", settings: api.settings, keys,
    localBase: () => local.base,
    fetchImpl: (url, options) => { active(options?.signal); if (mode() === "local-only") throw Error("Local-Only blocks the remote relay."); return api.network.fetch(url, options); },
  });
  async function stopRelay(preserveChoice = false) {
    const resume = preserveChoice && api.settings.get("remote.enabled") === true;
    relay.stop(); await relay.drain?.();
    if (resume) api.settings.set("remote.enabled", true);
  }
  const snapshot = () => ({ ok: true, localBase: local.base, privacyMode: mode(), models: local.models().map(({ alias, label, status }) => ({ alias, label, status })), keys: keys.list(), required: true, remote: relay.status() });
  async function call(method, input = {}, signal) {
    active(signal);
    if (method === "desktop.preferencesRead") {
      if (!Array.isArray(input.keys) || input.keys.some(k => k !== "kai-interface-language")) throw Error("Unknown desktop preference.");
      return { "kai-interface-language": api.desktop.preferences().language };
    }
    if (method !== "remote.api") throw Error("Unknown Remote Access operation.");
    if (!input || typeof input !== "object" || Array.isArray(input) || JSON.stringify(input).length > 4096 || Object.keys(input).some(k => !["action", "name", "id", "budgetUsdMonthly", "privacyMode", "enabled"].includes(k))) throw Error("Invalid Remote Access action.");
    await ensure(); active(signal);
    if (input.action === "status") return snapshot();
    if (busy) throw Error("Wait for the current Remote Access action to finish.");
    busy = true;
    try {
      if (input.action === "privacy") {
        if (!["local-only", "local-first", "network"].includes(input.privacyMode)) throw Error("Choose a privacy mode.");
        if (input.privacyMode === "local-only") await stopRelay();
        await api.network.configure({ privacyMode: input.privacyMode }); active(signal); return snapshot();
      }
      if (input.action === "toggle") {
        if (typeof input.enabled !== "boolean") throw Error("Invalid remote toggle.");
        if (!input.enabled) { await stopRelay(); local.cancelRequests(); return snapshot(); }
        if (mode() === "local-only") throw Error("Choose Local-First or Network before enabling remote access.");
        if (!keys.required()) throw Error("Create an API key before enabling remote access.");
        if (!await api.desktop.confirm("Enable Remote Access?", "Your local model API will be reachable through koinosai.com while KAI is running. Every request requires one of this plugin’s API keys. Prompts and replies pass through the relay. Only model listing, local text chat and embeddings are exposed; wallet, Brain, connected accounts and other plugin services are not remote endpoints.")) return { ...snapshot(), cancelled: true };
        active(signal); if (mode() === "local-only") throw Error("Remote access was blocked by Privacy.");
        await relay.start(); return snapshot();
      }
      if (input.action === "create") {
        if (typeof input.name !== "string" || !input.name.trim() || input.name.length > 80 || /[\r\n\0]/.test(input.name)) throw Error("Use a key name under 80 characters.");
        if (!await api.desktop.confirm("Create a Remote Access API key?", `Create “${input.name.trim()}”? This key can list installed local models and request local text inference or embeddings. The secret is shown once. These keys belong only to Remote Access.`)) return { cancelled: true };
        active(signal); return { ok: true, ...keys.create({ name: input.name.trim() }) };
      }
      if (!["budget", "revoke"].includes(input.action) || typeof input.id !== "string" || !/^key_[a-f0-9]{12}$/.test(input.id) || !keys.list().some(k => k.id === input.id)) throw Error("Unknown API key action.");
      if (input.action === "budget") {
        if (input.budgetUsdMonthly !== null && (typeof input.budgetUsdMonthly !== "number" || !Number.isFinite(input.budgetUsdMonthly) || input.budgetUsdMonthly < 0)) throw Error("Budget must be a nonnegative dollar amount.");
        keys.setBudget(input.id, input.budgetUsdMonthly); return snapshot();
      }
      if (!await api.desktop.confirm("Revoke API key?", "Clients using this Remote Access key will lose access immediately. Active model requests will stop.")) return { ...snapshot(), cancelled: true };
      active(signal); keys.revoke(input.id); local.cancelRequests(); if (!keys.required()) await stopRelay(); return snapshot();
    } finally { busy = false; }
  }
  return {
    call,
    async startBackground() { active(); await ensure(); if (api.settings.get("remote.enabled") === true && mode() !== "local-only" && keys.required()) await relay.start(); return snapshot(); },
    async privacyChanged(privacyMode) { if (privacyMode === "local-only") await stopRelay(); },
    dispose() {
      if (disposing) return disposing;
      closed = true;
      disposing = (async () => { try { relay.stop({ persist: false }); await relay.drain?.(); } finally { await local.stop(); } })().catch(error => { disposing = null; throw error; });
      return disposing;
    },
  };
}
module.exports = { create };
