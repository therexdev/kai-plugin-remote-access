"use strict";
// The Core origin preserves the original app's private interface preference.
// Read only that fixed key on every launch: plugin sessions are disposable and
// changing the Core language must also apply the next time this window opens.
window.kaiLanguageReady = (async () => {
  const values = await window.kai.call("desktop.preferencesRead", { keys: ["kai-interface-language"] });
  const language = KaiI18n.normalize(values?.["kai-interface-language"]);
  if (language) KaiI18n.setLanguage(language);
})().catch(error => {
  const message = document.getElementById("remote-error");
  if (message) message.textContent = "Could not load the language setting: " + error.message;
  const notice = document.getElementById("remote-notice");
  if (notice) notice.hidden = false;
});
