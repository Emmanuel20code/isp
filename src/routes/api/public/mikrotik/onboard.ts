// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { handleOnboardRequest, handleOnboardPostRequest } from "@/lib/mikrotik-handlers";

export const Route = createFileRoute("/api/public/mikrotik/onboard")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        let token = url.searchParams.get("token")?.trim();

        // Fallback: If pasted in a terminal that stripped '?' resulting in /onboardtoken=XYZ
        if (!token && url.pathname.includes("onboardtoken=")) {
          const match = url.pathname.match(/onboardtoken=([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            token = match[1];
          }
        }

        return handleOnboardRequest(token, request);
      },
      POST: async ({ request }) => {
        const body = await request.json();
        const token = body.token?.trim();
        return handleOnboardPostRequest(token, body, request);
      },
    },
  },
});
