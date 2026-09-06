// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { handlePortalFileRequest } from "@/lib/mikrotik-handlers";

export const Route = createFileRoute("/api/public/mikrotik/portal-file/$token/$file")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { token, file } = params as { token?: string; file?: string };
        return handlePortalFileRequest(token, file, request);
      },
    },
  },
});
