import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function requireTenant(supabase: Record<string, unknown>, userId: string): Promise<string> {
  const { data } = await supabase
    .from("tenant_members")
    .select("tenant_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.tenant_id) throw new Error("No business found for this account");
  return data.tenant_id;
}

const deviceSchema = z.object({
  fullName: z.string().min(2),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, "Invalid MAC address"),
  routerId: z.string().uuid().optional().nullable(),
});

export const listDevices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data, error } = await supabase
      .from("customers")
      .select("*, packages(name), routers(name)")
      .eq("tenant_id", tenantId)
      .eq("kind", "hotspot")
      .like("phone", "DEVICE-%")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listDeviceRouters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data: routers, error } = await supabase
      .from("routers")
      .select("id, name, status, last_seen_at")
      .eq("tenant_id", tenantId)
      .order("name", { ascending: true });

    if (error) throw new Error(error.message);
    return routers ?? [];
  });

export const addDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof deviceSchema>) => deviceSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const mac = data.macAddress.toUpperCase().replace(/-/g, ":");
    const phoneId = `DEVICE-${mac}`;

    const { data: row, error } = await supabase
      .from("customers")
      .insert({
        tenant_id: tenantId,
        full_name: data.fullName,
        phone: phoneId,
        kind: "hotspot",
        mac_address: mac,
        router_id: data.routerId ?? null,
        status: "active",
        expires_at: "2099-12-31T23:59:59Z", // Effectively unlimited
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        // Unique constraint violation
        throw new Error("A device with this MAC address is already registered.");
      }
      throw new Error(error.message);
    }

    // Determine target router(s) to bind
    const targetRouterIds: string[] = [];
    if (data.routerId) {
      targetRouterIds.push(data.routerId);
    } else {
      const { data: allRouters } = await supabase
        .from("routers")
        .select("id")
        .eq("tenant_id", tenantId);
      (allRouters ?? []).forEach((r: { id: string }) => targetRouterIds.push(r.id));
    }

    if (targetRouterIds.length > 0) {
      const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
      await enqueueRouterCommands(
        targetRouterIds.map((rId) => ({
          tenantId,
          routerId: rId,
          action: "hotspot.bind_mac",
          payload: {
            mac: mac,
            comment: `emmatech-device:${row.id}`,
          },
        })),
      );
    }

    return row;
  });

export const toggleDeviceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string; status: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data: customer, error: fetchErr } = await supabase
      .from("customers")
      .select("router_id, mac_address")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();

    if (fetchErr || !customer) throw new Error("Device not found");

    // Database enum 'customer_status' supports: 'active', 'disabled', 'expired'
    const targetStatus: "active" | "disabled" = data.status === "active" ? "active" : "disabled";

    const { error } = await supabase
      .from("customers")
      .update({ status: targetStatus })
      .eq("id", data.id)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);

    if (customer.mac_address) {
      const targetRouterIds: string[] = [];
      if (targetStatus === "active" && customer.router_id) {
        targetRouterIds.push(customer.router_id);
      } else {
        const { data: allRouters } = await supabase
          .from("routers")
          .select("id")
          .eq("tenant_id", tenantId);
        (allRouters ?? []).forEach((r: { id: string }) => targetRouterIds.push(r.id));
      }

      if (targetRouterIds.length > 0) {
        const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
        await enqueueRouterCommands(
          targetRouterIds.map((rId) => ({
            tenantId,
            routerId: rId,
            action: targetStatus === "active" ? "hotspot.bind_mac" : "hotspot.unbind_mac",
            payload: {
              mac: customer.mac_address,
              comment: `emmatech-device:${data.id}`,
            },
          })),
        );
      }
    }

    return { success: true };
  });

export const deleteDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const tenantId = await requireTenant(supabase, userId);

    const { data: customer } = await supabase
      .from("customers")
      .select("router_id, mac_address")
      .eq("id", data.id)
      .eq("tenant_id", tenantId)
      .single();

    if (customer?.mac_address) {
      const targetRouterIds: string[] = [];
      if (customer.router_id) {
        targetRouterIds.push(customer.router_id);
      } else {
        const { data: allRouters } = await supabase
          .from("routers")
          .select("id")
          .eq("tenant_id", tenantId);
        (allRouters ?? []).forEach((r: { id: string }) => targetRouterIds.push(r.id));
      }

      if (targetRouterIds.length > 0) {
        const { enqueueRouterCommands } = await import("@/lib/agent-commands.server");
        await enqueueRouterCommands(
          targetRouterIds.map((rId) => ({
            tenantId,
            routerId: rId,
            action: "hotspot.unbind_mac",
            payload: {
              mac: customer.mac_address,
            },
          })),
        );
      }
    }

    const { error } = await supabase
      .from("customers")
      .delete()
      .eq("id", data.id)
      .eq("tenant_id", tenantId);

    if (error) throw new Error(error.message);
    return { success: true };
  });
