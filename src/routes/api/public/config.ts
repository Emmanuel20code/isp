// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/config")({
  server: {
    handlers: {
      GET: async () => {
        const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
        const supabaseKey =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

        return new Response(
          JSON.stringify({
            configured: Boolean(supabaseUrl && supabaseKey),
            supabaseUrl,
            supabasePublishableKey: supabaseKey,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
            },
          },
        );
      },
    },
  },
});
