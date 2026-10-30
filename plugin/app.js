"use strict";
// Original Local API view: the gateway key list, budgets and one remote toggle.
const $ = id => document.getElementById(id);
let pending = false, latest = null;
const call = input => window.kai.call("remote.api", input);
function error(message) { $("remote-error").textContent = String(message); $("remote-notice").hidden = !message; }
$("remote-close").onclick = () => error("");
async function run(input) {
  if (pending) return;
  pending = true; error("");
  try { return await call(input); }
  catch (e) { error(e.message || "The action could not finish."); }
  finally { pending = false; }
}
function paintRemote(remote) {
  $("btn-remote-toggle").setAttribute("aria-checked", String(remote.enabled === true));
  $("remote-info").hidden = !remote.enabled;
  $("remote-base").textContent = remote.base || "connecting…";
  KaiI18n.setText($("remote-state"), remote.state === "connected" ? "Connected — this URL works from anywhere your key goes."
    : remote.state === "offline" ? "Reconnecting to koinosai.com…" : "Connecting…");
}
function paint(state) {
  latest = state;
  const alias = state.models.find(a => a.status === "ready")?.alias || state.models[0]?.alias || "dev-tiny";
  $("api-snippet").textContent = ["from openai import OpenAI", "", `client = OpenAI(base_url="${state.localBase}/v1", api_key="${state.required ? "YOUR_API_KEY" : "CREATE_AN_API_KEY"}")`, "resp = client.chat.completions.create(", `    model="${alias}",`, '    messages=[{"role": "user", "content": "Hello!"}],', ")"].join("\n");
  if (document.activeElement !== $("privacy-pick")) $("privacy-pick").value = state.privacyMode;
  paintRemote(state.remote);
  if ($("key-list").querySelector(".budget-edit")) return;
  $("key-list").replaceChildren();
  for (const k of state.keys) {
    const li = document.createElement("li"), left = document.createElement("span"), meta = document.createElement("span");
    left.textContent = k.name + " "; meta.className = "meta";
    const u = k.usage || { requests: 0, inTok: 0, outTok: 0, costUsd: "0" };
    meta.textContent = `${u.requests} req · ${u.inTok.toLocaleString()} in / ${u.outTok.toLocaleString()} out tok · $${Number(u.costUsd).toFixed(4)}` + (k.budgetUsdMonthly != null ? ` / $${k.budgetUsdMonthly} budget` : "");
    left.append(meta);
    const budget = document.createElement("button"); budget.className = "linklike"; KaiI18n.setText(budget, "budget");
    budget.onclick = () => {
      if (li.querySelector(".budget-edit")) return;
      const wrap = document.createElement("span"), input = document.createElement("input"), save = document.createElement("button"), cancel = document.createElement("button");
      wrap.className = "budget-edit"; input.type = "number"; input.min = "0"; input.step = "0.01"; input.className = "small";
      input.placeholder = "USD / month — empty = no limit"; input.value = k.budgetUsdMonthly ?? "";
      save.className = "small primary"; KaiI18n.setText(save, "Save"); cancel.className = "small"; KaiI18n.setText(cancel, "Cancel");
      const commit = async () => {
        save.disabled = true; const value = input.value.trim();
        const result = await run({ action: "budget", id: k.id, budgetUsdMonthly: value === "" ? null : Number(value) });
        if (result) { wrap.remove(); paint(result); } else save.disabled = false;
      };
      save.onclick = commit; cancel.onclick = () => wrap.remove();
      input.onkeydown = e => { if (e.key === "Enter") void commit(); if (e.key === "Escape") wrap.remove(); };
      wrap.append(input, save, cancel); li.append(wrap); input.focus();
    };
    const revoke = document.createElement("button"); KaiI18n.setText(revoke, "revoke");
    revoke.onclick = async () => { const result = await run({ action: "revoke", id: k.id }); if (result) paint(result); };
    li.append(left, budget, revoke); $("key-list").append(li);
  }
}
$("btn-new-key").onclick = async () => {
  const result = await run({ action: "create", name: `key ${new Date().toISOString().slice(0, 10)}` });
  if (result?.secret) { $("new-key-value").textContent = result.secret; $("new-key-reveal").hidden = false; }
  await refresh();
};
$("btn-remote-toggle").onclick = async () => { const result = await run({ action: "toggle", enabled: !latest?.remote.enabled }); if (result) paint(result); };
$("privacy-pick").onchange = async () => { const result = await run({ action: "privacy", privacyMode: $("privacy-pick").value }); if (result) paint(result); };
async function refresh() { if (pending) return; try { paint(await call({ action: "status" })); } catch (e) { error(e.message); } }
window.addEventListener("pagehide", () => { $("new-key-value").textContent = ""; });
void window.kaiLanguageReady.then(refresh); setInterval(refresh, 3000);
