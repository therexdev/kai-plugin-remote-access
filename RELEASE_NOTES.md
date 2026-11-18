# KAI Remote Access 0.3.4

API clients can now discover each local model's permitted context window. With Core 0.7.32 or newer, requests can ask for a larger minimum and Core allocates and verifies the needed context automatically. The verified allocation is preserved in streaming responses through the local API and remote relay.

Update **KAI Core to 0.7.32 first**, then update this plugin from **Plugins**. Install **kai Android 0.4.16** for automatic discovery before chats and saved tasks. Existing API keys and connection addresses remain valid; no credential reset is required. Older Core versions keep their existing fixed-window behavior.

The API remains limited to installed local models, bounded text inference and embeddings. Request-body limits and prepaid-network routing are unchanged.

## Previous release

# KAI Remote Access 0.3.3

Fixes remote access remaining on Connecting after approval. Relay requests now use only the supported Foundation network options, including streamed responses. Failed connection attempts show a retry state, and pollers share and retry the initial handshake before reporting a usable URL. Relay response bodies are released and failed uploads are no longer reported as served.

Adds regression coverage for the approved service flow, transient handshake failure and recovery, idle polling, streamed replies, authentication, forbidden routes and cancellation. No Core update or credential reset is required by this change.

## Previous release

# KAI Remote Access 0.3.2

Completes translation coverage for menus, forms, dialogs, tooltips and changing status text in English, Spanish, Brazilian Portuguese, French and German. Open views follow the language saved in Core Settings, including labels created after the view loads. Drafts, names, code and other user content remain intact.

Includes readable offline catalogs, reproducible generation, contributor documentation and regression tests for live language changes. Requires Core 0.7.17 or newer.

## Previous release

Remote Access 0.3.1 — plugin-owned foundation architecture

Follows the language saved in Core Settings, including changes to open views. Supports English, Spanish, Brazilian Portuguese, French and German with offline catalogs. Core owns the first-run choice; plugin content and identifiers stay literal. Requires Core 0.7.17 or newer.

## Previous release

Remote Access 0.3.0 — plugin-owned foundation architecture

API credentials, usage, local listener and relay now belong entirely to this plugin. Core supplies documented public model, privacy, preference and storage services.

Fresh plugin storage replaces shared legacy credentials. Every local or remote API request requires a key. Only installed local model listing, bounded text chat and embeddings are available; no private app routes, tools, wallet operations or paid inference are exposed.

Requires Foundation's schema 2 / API 3 runtime and explicit native-code trust (full computer access). No client dependency installation runs.
