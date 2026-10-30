# KAI Remote Access

Remote Access owns its local API server, API keys, usage counters, monthly budget settings and optional relay connection. The UI retains the endpoint example, privacy control, key list, one-time key creation, budgets, usage, revocation and remote switch. No optional Node/Developer/Code management controls are included.

Version 0.3 uses fresh plugin-owned storage. Old gateway keys and relay tokens are not imported or modified. Core supplies only public model inference, privacy controls, preferences, storage and action reviews through Foundation API v1.

## Access

The plugin starts an OpenAI-compatible HTTP listener on `127.0.0.1`. Its current address appears in the screen. Every request requires one of this plugin's API keys, including requests from the same computer. Only key digests are stored; the full secret is shown once.

Only `GET /v1/models`, `POST /v1/chat/completions` and `POST /v1/embeddings` are available. The model list includes installed, ready local models. Chat accepts bounded text messages and supports live streaming. Other routes, tools, private provider models, browser-origin requests and plugin service calls are rejected. Core wallets, Brain, connected accounts and other apps are never remote endpoints.

Local inference has zero network charge. Actual returned token usage is recorded. Dollar budgets remain visible and stored, but this local-only API cannot purchase or spend credits; enabling the relay does not grant paid network inference.

The remote switch requires a key, Local-First or Network privacy mode, and an explicit review. Prompts and replies pass through koinosai.com. Page changes and KAI's tray state leave the plugin running. Stop, Local-Only, disabling/removing the plugin and quitting KAI stop the relay; revoking a key cancels active inference. A previously enabled relay can resume at startup when privacy permits.

## Trust and development

Installing the native service grants **full computer and application access**. Sandboxing the renderer does not sandbox the native service. Install only trusted native plugins. This plugin deliberately exposes only the model endpoints to remote clients.

There are no third-party runtime dependencies or client install scripts. `npm test` covers credentials, local-only model filtering, forbidden routes, browser requests, stream/token accounting, privacy gates, revocation and teardown after Core revokes its API. `node scripts/verify-package.js` verifies a signed package against checked-in source.

Requires Foundation's schema 2 / API 3 runtime. Live public relay operation is a separate integration check; the tests use a synthetic relay and real loopback HTTP server.

## Foundation package publication

Requires KAI Core **0.7.0 or later**, manifest schema 2/API 3 and native API v1. Source lives in `plugin/`, including its service and all runtime dependencies. Runtime installation never runs npm or dependency hooks.

Before signing, install any author dependencies with `npm ci --ignore-scripts` when this repository has a lockfile, run `npm run build --if-present`, then `node scripts/verify-package.js --source` and `npm test`. The source-only check uses a temporary in-memory test signature; it does not claim a publisher release was signed.

Pack the complete plugin using Core's `scripts/core/pack-plugin.js`, keeping the publisher private key outside every repository. Place the new immutable signed asset at `dist/<repository-name>-<manifest-version>.kaiplugin`, then run `node scripts/verify-package.js`. The release verifier checks the actual publisher signature and exact source/assets/dependency contents against the same package rules as Core. Its standalone format snapshot and SHA-256 provenance are under `scripts/package-format-v3*`; it never imports or executes submitted plugin code.

CI tests source on `foundation-v1`, pull requests and `main` on Windows, macOS and Linux. It checks any signed asset present for the current version. Publication runs only from `main`, only when that exact signed asset exists, and only after every check passes. Existing release assets must match byte-for-byte and are never overwritten. Branch builds cannot publish releases. Native device/integration checks remain necessary before a release; unit tests do not replace them.
