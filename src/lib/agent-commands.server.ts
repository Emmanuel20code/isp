type Command = {
  tenantId: string;
  routerId: string;
  action: string;
  payload?: Record<string, unknown>;
};

/** Queue work for the on-site router agent. Never throws — provisioning is best-effort. */
export async function enqueueRouterCommands(commands: Command[]): Promise<void> {
  if (commands.length === 0) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("router_commands").insert(
      commands.map((c) => ({
        tenant_id: c.tenantId,
        router_id: c.routerId,
        action: c.action,
        payload: (c.payload ?? {}) as never,
      })),
    );
  } catch (err) {
    console.error("[agent] could not queue commands", err);
  }
}
