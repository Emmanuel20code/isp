// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { handlePortalFileRequest } from "@/lib/mikrotik-handlers";

export const Route = createFileRoute("/api/public/mikrotik/portal-file")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("token")?.trim();
        const file = url.searchParams.get("file")?.trim() || "login.html";
        return handlePortalFileRequest(token, file, request);
      },
    },
  },
});
