import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || "0.0.0.0";

// Import the Cloudflare module handler
const { default: handler } = await import("./.output/server/index.mjs");

// Create HTTP server that uses the Cloudflare fetch handler
const server = createServer(async (req, res) => {
  try {
    // Convert Node.js request to Fetch API Request
    const url = new URL(
      req.url,
      `http://${req.headers.host || `${HOST}:${PORT}`}`
    );

    const fetchRequest = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD"].includes(req.method) ? null : req,
    });

    // Call the Cloudflare handler
    const response = await handler.fetch(fetchRequest, {}, {});

    // Send response
    res.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) {
      res.end(await response.text());
    } else {
      res.end();
    }
  } catch (error) {
    console.error("Server error:", error);
    res.writeHead(500, { "content-type": "text/html" });
    res.end("<h1>500 Internal Server Error</h1>");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`🚀 Server listening on http://${HOST}:${PORT}`);
});

