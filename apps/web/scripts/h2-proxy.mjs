/**
 * Local HTTP/2 + TLS proxy for production-like Lighthouse runs (CDNs serve h2; `next start` is HTTP/1.1).
 *   node scripts/h2-proxy.mjs <key.pem> <cert.pem> [listenPort=3443] [target=http://localhost:3005]
 */
import fs from "node:fs";
import http2 from "node:http2";
import http from "node:http";

const [keyPath, certPath, port = "3443", target = "http://localhost:3005"] = process.argv.slice(2);
const upstream = new URL(target);
const HOP = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "http2-settings", "host"]);

const server = http2.createSecureServer({ key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), allowHTTP1: true }, (req, res) => {
  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) if (!k.startsWith(":") && !HOP.has(k)) headers[k] = v;
  headers.host = upstream.host;
  const proxied = http.request({ hostname: upstream.hostname, port: upstream.port, path: req.url, method: req.method, headers }, (up) => {
    const out = {};
    for (const [k, v] of Object.entries(up.headers)) if (!HOP.has(k)) out[k] = v;
    res.writeHead(up.statusCode ?? 502, out);
    up.pipe(res);
  });
  proxied.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(proxied);
});
server.listen(Number(port), () => console.log(`h2 proxy https://localhost:${port} → ${target}`));
