# KAI Remote Access

The original Local API and Remote Access screen, installed as a KAI Core plugin. It uses the original API-key manager and RemoteAccess relay implementation.

The screen includes the local OpenAI-compatible endpoint and example, network/privacy selector, existing API keys, one-time key creation, monthly network budgets, token/cost usage, key revocation and the original remote-access switch and connection address.

The original optional-section rows are restored for Koinos Node, Developer tools and Koinos Code. Developer and Code switches use each installed plugin’s reviewed native broker; Node visibility is managed in Plugins without changing the running node. Missing or disabled plugins open Plugins for installation or management, and enabled workspaces have an Open link.

The original offline language engine, catalogs and language styles are bundled unchanged. The screen reads only the saved Core interface-language preference when opening; keys, addresses, model aliases and user-entered key names remain unchanged by translation.

Remote traffic uses the original authenticated `/v1/` gateway, including its real streaming, model routing and per-key budgets. The relay never receives access to `/core/`, the desktop control plane, wallet keys or plugin APIs. Local-Only prevents remote activation. Enabling remote access requires a native review and at least one API key; revoking the final key stops access.

Closing the plugin window leaves an enabled session running while Core remains open. Stop, Local-Only, plugin disable/uninstall and Core shutdown end the session. The original relay identity and saved gateway API keys remain in the shared profile. Earlier plugin-specific keys remain preserved, and the earlier limited remote API remains available for compatibility; the restored screen manages the original gateway keys.

The renderer uses only reviewed `window.kai.call` operations. Stored key digests, relay identity tokens and unrelated saved settings are not returned to it. A newly created API key is shown once, matching the original screen. Corrupt or externally changed settings are preserved for recovery.

Run `npm test` for the renderer contract checks. Core provides native service, authentication, storage, privacy, streaming and desktop integration coverage. Releases require the matching Core feature APIs and an immutable signed package from the existing publisher.
