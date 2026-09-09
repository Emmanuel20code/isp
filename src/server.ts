import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

// Server configuration for local development and Railway deployment
export const PORT = process.env.PORT || 3000;
export const HOST = "0.0.0.0";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {\"unhandled\":true,\"message\":\"HTTPError\"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/isrgrootx1.pem" || url.pathname === "/certs/isrgrootx1.pem") {
        const fs = await import("fs");
        const path = await import("path");
        try {
          const pem = fs.readFileSync(path.join(process.cwd(), "public", "isrgrootx1.pem"), "utf-8");
          return new Response(pem, {
            status: 200,
            headers: { 
              "Content-Type": "application/x-pem-file; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            },
          });
        } catch (e) {
          console.error("Failed to read isrgrootx1.pem certificate:", e);
        }
      }

      if (
        url.pathname.startsWith("/scripts/mainhotspot") ||
        url.pathname.includes("mainhotspot") ||
        url.pathname.startsWith("/scripts/onboard/") ||
        url.pathname.startsWith("/scripts/portal/")
      ) {
        if (url.pathname.startsWith("/scripts/portal/")) {
          const parts = url.pathname.split("/").filter(Boolean); // ["scripts", "portal", "TOKEN", "login.html"]
          const token = parts[2] || "";
          const file = parts[3] || "login.html";
          const { handlePortalFileRequest } = await import("./lib/mikrotik-handlers");
          return await handlePortalFileRequest(token, file, request);
        }

        // Parse token and type from path or query parameters
        let token = url.searchParams.get("token") || "";
        let type = url.searchParams.get("type") || "mainhotspot";

        if (url.pathname.startsWith("/scripts/onboard/")) {
          const parts = url.pathname.split("/").filter(Boolean); // ["scripts", "onboard", "TOKEN", "TYPE.rsc"]
          if (parts.length >= 4) {
            token = parts[2];
            type = parts[3].replace(/\.rsc$/, "");
          }
        } else if (url.pathname.startsWith("/scripts/mainhotspot/")) {
          const parts = url.pathname.split("/");
          token = parts[parts.length - 1].replace(/\.rsc$/, "");
          type = "mainhotspot";
        }

        if (!token) {
          const pathParts = url.pathname.split("/");
          const rscIdx = pathParts.findIndex(p => p.includes("mainhotspot"));
          if (rscIdx !== -1 && pathParts[rscIdx + 1]) {
            if (pathParts[rscIdx + 1] === "token" && pathParts[rscIdx + 2]) {
              token = pathParts[rscIdx + 2].replace(".rsc", "");
            } else {
              token = pathParts[rscIdx + 1].replace(".rsc", "");
            }
          }
        }

        if (!token) {
          const rawUrl = request.url;
          const tokenMatch = rawUrl.match(/(?:token|onboardtoken)[=_/]([a-zA-Z0-9_-]+)/i);
          if (tokenMatch && tokenMatch[1]) {
            token = tokenMatch[1];
          }
        }

        const { handleOnboardRequest } = await import("./lib/mikrotik-handlers");

        // Form a target URL with type parameter
        const targetUrl = new URL(url.origin + "/api/public/mikrotik/onboard");
        targetUrl.searchParams.set("token", token);
        targetUrl.searchParams.set("type", type);

        const newRequest = new Request(targetUrl.toString(), {
          headers: request.headers,
          method: request.method,
        });

        return await handleOnboardRequest(token, newRequest);
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
