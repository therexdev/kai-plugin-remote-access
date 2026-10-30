# KAI Remote Access 0.1.1

Restores the original KAI app layout in its own plugin window, with the same pearl and cobalt colors, typography, controls and scrollbars. Messages include an accessible dismiss button. Existing saved data and reviewed Core permissions are preserved.

# KAI Remote Access 0.1.0

Requires KAI Core 0.3.0 or later.

- Start and stop an explicitly reviewed outbound relay session for local text inference.
- Create dedicated remote API keys with native one-time clipboard copy; revoke access and cancel active requests.
- Preserve the existing relay identity and gateway API keys. Explicitly opt existing keys into remote access without changing their original local permissions.
- Support authenticated model listing and bounded OpenAI-compatible text chat, including buffered SSE responses for streaming clients.
- Stop access when the plugin closes or Core enters Local-Only. Never resume automatically.

This initial release uses the existing relay protocol at `https://koinosai.com`; hosted relay availability has not been verified, and this release does not provision that service. Protocol behavior is tested against a synthetic loopback relay. The relay receives API keys, prompts and responses. No wallet, account, Brain, filesystem, arbitrary gateway, network inference or paid service access is exposed. Token-by-token streaming, tools, media, embeddings and custom relay endpoints are not included. Temperature/top-p parameters do not override Core generation defaults.
