// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { validatePortalRequest } from "@/lib/portal.functions";

export const Route = createFileRoute("/api/public/portal-validate")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const slug = url.searchParams.get("slug");
          const routerId = url.searchParams.get("routerId");
          const mac = url.searchParams.get("mac");
          const ip = url.searchParams.get("ip");

          if (!slug) {
            return new Response(JSON.stringify({ success: false, message: "Missing slug" }), {
              status: 400,
              headers: { "Content-Type": "application/json" },
            });
          }

          const validation = await validatePortalRequest({
            data: {
              slug,
              routerId: routerId ?? undefined,
              mac: mac ?? undefined,
              ip: ip ?? undefined,
            },
          });

          return new Response(JSON.stringify({ success: true, ...validation }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err: unknown) {
          console.error("[portal-validate] API endpoint failure:", err);
          return new Response(
            JSON.stringify({
              success: false,
              error: "Internal Server Error",
            }),
            {
              status: 500,
              headers: { "Content-Type": "application/json" },
            },
          );
        }
      },
    },
  },
});
