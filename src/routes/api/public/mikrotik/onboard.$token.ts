// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { handleOnboardRequest } from "@/lib/mikrotik-handlers";

export const Route = createFileRoute("/api/public/mikrotik/onboard/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const token = (params as { token?: string }).token;
        return handleOnboardRequest(token, request);
      },
    },
  },
});
