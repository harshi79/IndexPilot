import { createServer } from "node:http";

const PORT = Number(process.env.HEALTH_PORT || process.env.PORT || 3001);

const server = createServer((req, res) => {
  const url = req.url?.split("?")[0];
  if (url === "/health" || url === "/healthz") {
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
    res.end("ok");
    return;
  }
  res.writeHead(404, { "Cache-Control": "no-store" });
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[health] listening on 0.0.0.0:${PORT} -> GET /health 200 ok`);
});
