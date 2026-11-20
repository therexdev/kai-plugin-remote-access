# Remote Access 0.3.6 validation

- 46 Node tests pass, including 10 slow-stream cases: delayed headers, idle fragmented UTF-8 frames, early/late rejection, auth and validation, bounded timeout, disconnect, key revocation, owner shutdown and truncated frames.
- The real Core Foundation SDK and runtime context integration passes with a synthetic child-process engine, including 4K-to-16K allocation and owner context limits.
- A 140,035 ms synthetic inference passes through the real Core public SDK, Remote Access service, hosted Relay implementation and a loopback proxy with a 125-second idle cutoff. First bytes arrive after 15,032 ms; nine keep-alives are received. Exactly one model request occurs, verified allocation is preserved, and tracked network work returns to zero on shutdown.
- The hosted-relay probe could not establish a connection because this workspace cannot resolve koinosai.com. The loopback probe is not a live Cloudflare or user-model verification.
- Publisher signature and exact source contents verified for the immutable 0.3.6 package. Publication CI repeats tests and signature verification on Linux, Windows and macOS.

The transport fix does not test a real model, GPU, Google action or physical phone. Remote inference is bounded at 170 seconds to leave headroom before Core 0.7.32's 180-second network limit. Direct local inference retains its four-minute bound. No Core or hosted-service modification is required. No automatic retry is introduced.
