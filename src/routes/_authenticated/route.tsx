import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TenantProvider } from "@/context/TenantContext";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user) {
        throw redirect({ to: "/auth" });
      }
      return { user: data.session.user };
    } catch (err) {
      if (err && typeof err === "object" && "to" in err) {
        throw err;
      }
      console.warn("[Auth Guard] Session check failed, redirecting to /auth:", err);
      throw redirect({ to: "/auth" });
    }
  },
  component: () => (
    <TenantProvider>
      <Outlet />
    </TenantProvider>
  ),
});
