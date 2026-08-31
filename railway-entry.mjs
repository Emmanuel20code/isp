import { createServer } from "http";
import { fileURLToPath } from "url";
import { dirname } from "path";

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

    // Build request body
    let body = null;
    if (!["GET", "HEAD"].includes(req.method)) {
      body = await new Promise((resolve) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks)));
      });
    }

    const fetchRequest = new Request(url, {
      method: req.method,
      headers: req.headers,
      body: body ? body : undefined,
    });

    // Call the Cloudflare handler with proper env and context
    const env = process.env;
    const context = {
      waitUntil: (promise) => promise,
    };

    const response = await handler.fetch(fetchRequest, env, context);

    // Send response
    res.writeHead(response.status, Object.fromEntries(response.headers));
    
    if (response.body) {
      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
      } finally {
        reader.releaseLock();
      }
    }
    res.end();
  } catch (error) {
    console.error("Server error:", error);
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>500 Internal Server Error</h1>");
  }
});

server.listen(PORT, HOST, () => {
  console.log(`➜ Listening on: http://${HOST}:${PORT}/ (all interfaces)`);
});

