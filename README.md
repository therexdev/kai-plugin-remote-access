# KAI Remote Access

An optional, signed KAI Core plugin that connects trusted clients to your installed local models through KAI's outbound HTTPS relay. Requires **KAI Core 0.3.0 or later**. It does not open a public listener or require router port forwarding.

## Install and use

1. Install Remote Access from Core's Plugins section, or install the signed `.kaiplugin` file from this repository's release. Review the native permission prompt.
2. In Core, install a local model and choose an online privacy mode. Local-Only blocks remote access.
3. Open Remote Access, name a key, and choose **Create and copy key**. Core asks for approval and copies the secret to the system clipboard once. Paste it into a trusted client's API key setting. The plugin renderer never receives the secret. Core clears the clipboard after 60 seconds if it still contains that key.
4. Turn the **Remote access** switch on. Review the relay disclosure, then wait for the connection and base URL. Copy the base URL into the client's OpenAI-compatible provider setting, and select an installed model's API name.
5. Keep the plugin window open. Turning **Remote access** off, closing the plugin, disabling it, quitting Core, and switching Core to Local-Only end the session. Access never resumes automatically.

The relay is fixed to `https://koinosai.com`. It receives client API keys, prompts and responses; use it only with clients and relay operators you trust. No connection to the hosted relay was made to test or publish this version. Automated tests validate its existing hello/poll/respond protocol against a synthetic loopback relay. If the hosted relay is unavailable, the plugin reports the offline state and retries until stopped. Deployment of this plugin does not provision or change the hosted relay.

The window follows the original Local API layout: API keys, the Remote access switch and base URL, then client setup. It uses the same light KAI colors, controls and scrollbars as Core. Messages can be dismissed with the X, and background refreshes preserve the selected model and key controls.

## Supported client API

| Request | Behavior |
| --- | --- |
| `GET /v1/models` | Lists installed, ready local models. Requires an enabled remote key. |
| `POST /v1/chat/completions` | Runs bounded text inference using an installed local model. Requires an enabled remote key. |

Set the client base URL to the displayed URL, which already ends in `/v1`. Chat requests accept `model`, text-only `messages` with `system`, `developer`, `user` or `assistant` roles, `max_tokens` or `max_completion_tokens`, and boolean `stream`. Up to 32 messages and 16,000 characters including role labels are accepted, with at most 4,096 output tokens. Conversations are rendered into a role-labeled text prompt for Core's local inference broker. `temperature`, `top_p` and `user` are tolerated for client compatibility, but do not override Core's local generation defaults or change routing.

For `stream: true`, the completed answer is returned as OpenAI-style SSE chunks followed by `[DONE]`; this initial version does not stream individual tokens during generation. Tools, attachments, images, embeddings, audio, arbitrary gateway paths, network inference and paid services are not exposed. At most two relay jobs run concurrently, subject to Core's shared local inference limit. Each key is limited to 30 requests per minute. Inference has a three-minute deadline.

## Existing data and credentials

Core uses the same Koinos AI profile as the old app. This plugin keeps the existing `remote.token` relay identity, preserving the address when the relay uses that identity. Existing `remote.enabled` settings are retained but never used to auto-start the new plugin. No wallet keys, account credentials, Brain entries, files, or other feature stores are made available remotely.

New remote keys are stored only as SHA-256 digests under `remote.pluginKeys` in the existing settings file. They do not authorize the general local gateway. Existing gateway API keys remain unchanged and are not automatically accepted remotely. In **Existing API keys and address settings**, you may explicitly allow an existing key after native review; the allowlist is stored in `remote.pluginLegacyKeys`. Removing its remote access preserves its original local gateway permissions. Revoke old keys from their original manager if you also want to remove those original permissions.

Revoking a remote key or changing the legacy-key allowlist stops the session and cancels active requests; restart when ready. Address replacement stops access and replaces only the relay identity. Keys remain saved. Corrupt, symlinked, hard-linked or externally changed settings fail closed and are preserved for recovery.

## Permissions and implementation

| Permission | Purpose |
| --- | --- |
| `remote-access.read` | Show sanitized connection state, model names and key metadata; copy the connected base URL. |
| `remote-access.control` | Review starting the relay connection, stop it, or review replacing the relay identity. |
| `remote-access.keys` | Review creation, revocation or explicit adoption of scoped API keys. |

The renderer is sandboxed and uses only `window.kai.call`. Private APIs are reserved to this official plugin ID and pinned publisher in Core. Core's native broker validates every operation; the relay client calls only the private local inference broker and never proxies requests to Core's gateway. It does not expose arbitrary URLs, processes, filesystem paths, account tokens or wallet operations.

The host implementation lives in `therexdev/kai-core` under `electron/plugin-services/remote-access.js` and `remote-tunnel.js`. The old Alpha/Test pipelines and stores remain separate from this repository.

## Development and releases

Run `npm test` for the standalone renderer/manifest contract checks. Native integration, authentication, lifecycle, corruption and synthetic relay tests live in Core's `core/test-core/plugin-remote-access.test.js`. Core CI also opens this signed plugin in the real sandboxed Electron host on Windows, macOS and Linux.

The checked-in `dist` bundle is signed outside GitHub with the existing KAI publisher key. Never commit private keys. On `main`, the release workflow validates the Ed25519 signature and exact source match before publishing an immutable versioned `.kaiplugin` asset. A source change requires a version bump and a newly signed bundle; existing release payloads are never replaced silently.
