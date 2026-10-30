"use strict";
(() => {
  const controls = { node: "btn-koinos-toggle", developer: "btn-dev-toggle", code: "btn-code-toggle" };
  const labels = { node: "Koinos Node", developer: "Developer tools", code: "Koinos Code" };
  let current = new Map(), pending = false;
  const notice = error => { document.getElementById("optional-error").textContent = error?.message || String(error || ""); document.getElementById("optional-notice").hidden = !error; };
  document.getElementById("optional-close").onclick = () => notice("");
  function paint(value) {
    if (!Array.isArray(value?.features)) return;
    current = new Map(value.features.map(row => [row.name, row]));
    for (const [name, id] of Object.entries(controls)) {
      const row = current.get(name); if (!row) continue;
      const toggle = document.getElementById(id), open = document.getElementById(`optional-${name}-open`), manage = document.getElementById(`optional-${name}-manage`);
      toggle.setAttribute("aria-checked", String(row.enabled === true));
      toggle.title = name === "node" ? "Manage Koinos Node in Plugins" : row.available ? `Turn ${labels[name]} ${row.enabled ? "off" : "on"}` : `Install or enable ${labels[name]} in Plugins`;
      open.hidden = !row.available || !row.enabled; open.textContent = "Open " + labels[name];
      manage.textContent = row.available ? "Manage plugin" : "Install or enable plugin";
      document.getElementById(`optional-${name}-status`).textContent = row.error || (!row.available ? "Install and enable its plugin to use this workspace." : name === "node" ? "Installed. Manage visibility in Plugins; open Koinos Node for its running status and controls." : row.enabled ? "On — open its separate workspace below." : "Off — switch it on to open its workspace.");
    }
  }
  async function act(input) {
    if (pending) return; pending = true; notice("");
    for (const id of Object.values(controls)) document.getElementById(id).disabled = true;
    try { paint(await window.kai.call("remote.features", input)); }
    catch (error) { notice(error); }
    finally { pending = false; for (const id of Object.values(controls)) document.getElementById(id).disabled = false; }
  }
  for (const [name, id] of Object.entries(controls)) {
    document.getElementById(id).onclick = () => act({ action: "toggle", feature: name, enabled: !current.get(name)?.enabled });
    document.getElementById(`optional-${name}-open`).onclick = () => act({ action: "open", feature: name });
    document.getElementById(`optional-${name}-manage`).onclick = () => act({ action: "manage", feature: name });
  }
  async function refresh() { if (pending) return; try { paint(await window.kai.call("remote.features", { action: "status" })); } catch (error) { notice(error); } }
  void refresh(); setInterval(refresh, 5000);
  window.addEventListener("focus", refresh);
})();
