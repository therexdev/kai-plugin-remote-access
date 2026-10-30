# Remote Access 0.3.0 — plugin-owned foundation architecture

API credentials, usage, local listener and relay now belong entirely to this plugin. Core supplies documented public model, privacy, preference and storage services.

Fresh plugin storage replaces shared legacy credentials. Every local or remote API request requires a key. Only installed local model listing, bounded text chat and embeddings are available; no private app routes, tools, wallet operations or paid inference are exposed.

Requires Foundation's schema 2 / API 3 runtime and explicit native-code trust (full computer access). No client dependency installation runs.
