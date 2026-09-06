// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { runBackgroundMaintenance } from "@/lib/maintenance.server";

export const Route = createFileRoute("/api/public/cron")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          // Optional: Check a secret query token to authenticate the cron request
          const url = new URL(request.url);
          const token = url.searchParams.get("token");
          const CRON_SECRET = process.env.CRON_SECRET || "emmatech_default_cron_secret";

          if (process.env.CRON_SECRET && token !== CRON_SECRET) {
            return new Response("Unauthorized", { status: 401 });
          }

          // Force run maintenance (overrides the 1-minute rate-limiting check)
          const results = await runBackgroundMaintenance(true);

          return new Response(
            JSON.stringify({
              success: true,
              timestamp: new Date().toISOString(),
              results,
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            },
          );
        } catch (err: unknown) {
          console.error("[cron] API endpoint failure:", err);
          const errMsg = err instanceof Error ? err.message : "Internal Server Error";
          return new Response(
            JSON.stringify({
              success: false,
              error: errMsg,
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
