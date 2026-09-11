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
async function normalizeCatastrophicSsrResponse(
  request: Request,
  response: Response,
): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  const error = consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`);
  console.error(error);

  const url = new URL(request.url);
  const isApiRequest =
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/_server") ||
    request.headers.get("accept")?.includes("application/json") ||
    request.headers.get("x-server-function") === "true";

  if (isApiRequest) {
    return new Response(
      JSON.stringify({
        error: "Internal Server Error",
        message: error.message,
        status: 500,
      }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
  }

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
      if (
        url.pathname === "/scripts/mainhotspot.rsc" ||
        url.pathname.startsWith("/scripts/mainhotspot.rsc") ||
        url.pathname.includes("mainhotspot.rsc")
      ) {
        // Parse token
        let token = url.searchParams.get("token") || "";
        if (!token) {
          // Fallback: search in url string for token=... or onboardtoken=...
          const rawUrl = request.url;
          const tokenMatch = rawUrl.match(/(?:token|onboardtoken)=([a-zA-Z0-9_-]+)/i);
          if (tokenMatch && tokenMatch[1]) {
            token = tokenMatch[1];
          }
        }

        const { handleOnboardRequest } = await import("./lib/mikrotik-handlers");

        // Form a target URL with type=mainhotspot
        const targetUrl = new URL(url.origin + "/api/public/mikrotik/onboard");
        targetUrl.searchParams.set("token", token);
        targetUrl.searchParams.set("type", "mainhotspot");

        const newRequest = new Request(targetUrl.toString(), {
          headers: request.headers,
          method: request.method,
        });

        return await handleOnboardRequest(token, newRequest);
      }

      if (url.pathname === "/api/radius/auth" && request.method === "POST") {
        const { username, password } = await request.json();
        const { supabaseAdmin } = await import("./integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.auth.signInWithPassword({
          email: username,
          password: password,
        });
        if (error) {
          return new Response(JSON.stringify({ status: "reject" }), {
            status: 401,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ status: "accept" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalized = await normalizeCatastrophicSsrResponse(request, response);
      if (normalized.status >= 500) {
        console.error(`[Server] Returning 500 for ${url.pathname}`);
      }
      return normalized;
    } catch (error) {
      console.error("[Server] Critical error in fetch handler:", error);

      const url = new URL(request.url);
      const isApiRequest =
        url.pathname.startsWith("/api/") ||
        url.pathname.startsWith("/_server") ||
        request.headers.get("accept")?.includes("application/json") ||
        request.headers.get("x-server-function") === "true";

      if (isApiRequest) {
        return new Response(
          JSON.stringify({
            error: "Critical Server Error",
            message: error instanceof Error ? error.message : String(error),
            status: 500,
          }),
          {
            status: 500,
            headers: { "content-type": "application/json" },
          },
        );
      }

      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
