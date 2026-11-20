"use strict";
// Integration-only socket adapter. No external connections: exercise the real
// SDK HTTP upload and hosted Relay implementation behind a local idle proxy.
const http = require("node:http"), https = require("node:https"), dns = require("node:dns").promises, path = require("node:path");
module.exports = async function relayFixture(siteRoot) {
  const { Relay } = require(path.resolve(siteRoot, "lib/relay"));
  const origin = "https://relay.fixture.invalid", relay = new Relay({ publicBase: origin });
  const server = http.createServer((req, res) => {
    if (req.url.startsWith("/relay/")) { req.url = req.url.slice(6); void relay.handleDevice(req, res); }
    else if (req.url.startsWith("/r/")) { req.url = req.url.slice(2); void relay.handlePublic(req, res); }
    else { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  let idleTimeouts = 0;
  const proxy = http.createServer((req, res) => {
    const upstream = http.request({ hostname: "127.0.0.1", port: server.address().port, path: req.url, method: req.method, headers: req.headers }, reply => {
      res.writeHead(reply.statusCode, reply.headers); reply.pipe(res);
    });
    upstream.setTimeout(125000, () => { idleTimeouts++; if (!res.headersSent) { res.writeHead(524); res.end(); } else res.destroy(); upstream.destroy(); });
    upstream.on("error", () => { if (!res.destroyed) res.destroy(); });
    res.on("close", () => { if (!res.writableEnded) upstream.destroy(); });
    req.pipe(upstream);
  });
  await new Promise(resolve => proxy.listen(0, "127.0.0.1", resolve));
  const lookup = dns.lookup, request = https.request;
  dns.lookup = async (host, options) => {
    if (host !== "relay.fixture.invalid") throw Error("External DNS disabled in loopback probe");
    return options?.all ? [{ address: "1.1.1.1", family: 4 }] : { address: "1.1.1.1", family: 4 };
  };
  https.request = (url, options, callback) => {
    if (url.origin !== origin) throw Error("External HTTPS disabled in loopback probe");
    return http.request({ ...options, hostname: "127.0.0.1", port: proxy.address().port, path: url.pathname + url.search, lookup: undefined }, callback);
  };
  return {
    origin,
    publicUrl: url => url.replace(origin, `http://127.0.0.1:${proxy.address().port}`),
    get idleTimeouts() { return idleTimeouts; },
    async stop() {
      dns.lookup = lookup; https.request = request; relay.stop();
      for (const s of [proxy, server]) { s.closeAllConnections(); await new Promise(resolve => s.close(resolve)); }
    },
  };
};
