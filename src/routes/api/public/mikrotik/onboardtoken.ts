// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { handleOnboardRequest } from "@/lib/mikrotik-handlers";

export const Route = createFileRoute("/api/public/mikrotik/onboardtoken")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        // The token is in the path now: /onboardtoken=TOKEN
        const match = url.pathname.match(/onboardtoken=([a-zA-Z0-9_-]+)/);
        const token = match ? match[1] : null;
        
        return handleOnboardRequest(token, request);
      },
    },
  },
});
