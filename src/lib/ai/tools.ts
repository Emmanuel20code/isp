import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildMikrotikFetchCommand } from "@/lib/mikrotik";

export type ToolCategory = "READ" | "WRITE" | "DANGEROUS";

export interface ToolDefinition {
  name: string;
  description: string;
  category: ToolCategory;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export const AI_TOOLS: ToolDefinition[] = [
  {
    name: "get_customers",
    description:
      "Retrieve WiFi customers, optional status filter ('active', 'expired', 'disabled').",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "Filter status: active, expired, disabled" },
        search: { type: "string", description: "Search phone number or full name" },
        limit: { type: "number", description: "Limit number of records (default 20)" },
      },
    },
  },
  {
    name: "get_customer",
    description: "Get detailed information about a specific customer by ID or phone number.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        identifier: { type: "string", description: "Customer ID or Phone number" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "get_customer_subscription",
    description: "Get active subscription/package details for a customer.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "Customer UUID" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "get_transactions",
    description: "Get recent payment transactions including M-Pesa payments.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "pending, success, failed" },
        limit: { type: "number", description: "Limit number of results (default 20)" },
      },
    },
  },
  {
    name: "get_router_status",
    description: "Get status summary of all routers or a specific router.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        router_id: { type: "string", description: "Optional specific router UUID" },
      },
    },
  },
  {
    name: "get_router_health",
    description: "Get CPU, memory, uptime, and last heartbeat data for a router.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        router_id: { type: "string", description: "Router UUID" },
      },
      required: ["router_id"],
    },
  },
  {
    name: "get_hotspot_users",
    description: "Get currently active Hotspot and PPPoE users across routers.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        router_id: { type: "string", description: "Optional router filter" },
      },
    },
  },
  {
    name: "get_active_sessions",
    description: "Get active customer sessions and access grants.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        tenant_id: { type: "string" },
      },
    },
  },
  {
    name: "get_packages",
    description: "Get all available WiFi billing packages.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_revenue",
    description: "Calculate revenue statistics for today, this week, or this month.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", description: "today, week, month, or all" },
      },
    },
  },
  {
    name: "search_system_logs",
    description: "Search system audit logs and action logs for troubleshooting.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Keyword to search in logs" },
      },
    },
  },
  {
    name: "create_customer",
    description: "Create a new WiFi customer record.",
    category: "WRITE",
    parameters: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        phone: { type: "string" },
        package_id: { type: "string" },
      },
      required: ["full_name", "phone"],
    },
  },
  {
    name: "create_package",
    description: "Create a new WiFi package.",
    category: "WRITE",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string" },
        price_kes: { type: "number" },
        duration_hours: { type: "number" },
        speed_down_mbps: { type: "number" },
        speed_up_mbps: { type: "number" },
      },
      required: ["name", "price_kes", "duration_hours"],
    },
  },
  {
    name: "activate_subscription",
    description: "Activate or extend a customer's subscription manually.",
    category: "WRITE",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        duration_hours: { type: "number" },
      },
      required: ["customer_id", "duration_hours"],
    },
  },
  {
    name: "suspend_subscription",
    description: "Suspend a customer's internet subscription immediately.",
    category: "WRITE",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        reason: { type: "string" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "grant_customer_access",
    description: "Grant WiFi internet access to a customer on the router.",
    category: "WRITE",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
        duration_hours: { type: "number" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "revoke_customer_access",
    description: "Revoke WiFi access for a customer and disconnect their active session.",
    category: "WRITE",
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string" },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "generate_router_configuration",
    description: "Generate MikroTik RouterOS script configuration for a router.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        router_id: { type: "string" },
      },
      required: ["router_id"],
    },
  },
  {
    name: "diagnose_router",
    description: "Diagnose why a router is offline or experiencing network issues.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        router_id: { type: "string" },
      },
      required: ["router_id"],
    },
  },
  {
    name: "generate_report",
    description:
      "Generate an operational summary report of revenue, router health, and active users.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_ai_action_logs",
    description: "Retrieve recent AI operational action logs.",
    category: "READ",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number" },
      },
    },
  },
  {
    name: "toggle_autonomous_mode",
    description: "Enable or disable Autonomous AI Operations Mode.",
    category: "DANGEROUS",
    parameters: {
      type: "object",
      properties: {
        enabled: { type: "boolean" },
      },
      required: ["enabled"],
    },
  },
];

export async function executeAiTool(
  name: string,
  args: Record<string, any>,
  tenantId?: string,
): Promise<any> {
  switch (name) {
    case "get_customers": {
      let query = supabaseAdmin
        .from("customers")
        .select("id, full_name, phone, status, expires_at, kind, package_id, created_at")
        .order("created_at", { ascending: false })
        .limit(args.limit || 20);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      if (args.status) query = query.eq("status", args.status);
      if (args.search)
        query = query.or(`phone.ilike.%${args.search}%,full_name.ilike.%${args.search}%`);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_customer": {
      const { identifier } = args;
      let query = supabaseAdmin
        .from("customers")
        .select("*, packages(name, price_kes, duration_hours), routers(name, identity)")
        .or(`id.eq.${identifier},phone.eq.${identifier}`);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data?.[0] || { message: "Customer not found." };
    }

    case "get_customer_subscription": {
      const { customer_id } = args;
      const { data, error } = await supabaseAdmin
        .from("customers")
        .select("id, full_name, phone, status, expires_at, packages(*)")
        .eq("id", customer_id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_transactions": {
      let query = supabaseAdmin
        .from("transactions")
        .select(
          "id, phone, amount_kes, status, mpesa_receipt, checkout_request_id, created_at, failure_reason",
        )
        .order("created_at", { ascending: false })
        .limit(args.limit || 20);
      if (tenantId) query = query.eq("tenant_id", tenantId);
      if (args.status) query = query.eq("status", args.status);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_router_status": {
      let query = supabaseAdmin
        .from("routers")
        .select(
          "id, name, identity, ros_version, status, last_seen_at, active_hotspot_users, active_pppoe_users, public_ip",
        );
      if (tenantId) query = query.eq("tenant_id", tenantId);
      if (args.router_id) query = query.eq("id", args.router_id);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_router_health": {
      const { router_id } = args;
      const { data: router } = await supabaseAdmin
        .from("routers")
        .select("*")
        .eq("id", router_id)
        .maybeSingle();
      const { data: heartbeats } = await supabaseAdmin
        .from("router_heartbeats")
        .select("*")
        .eq("router_id", router_id)
        .order("created_at", { ascending: false })
        .limit(5);
      return {
        router,
        recent_heartbeats: heartbeats || [],
      };
    }

    case "get_hotspot_users": {
      const { data: routers } = await supabaseAdmin
        .from("routers")
        .select("id, name, active_hotspot_users, active_pppoe_users");
      const { data: activeCustomers } = await supabaseAdmin
        .from("customers")
        .select("id, full_name, phone, mac_address, status, expires_at")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      return {
        routers,
        active_customers: activeCustomers || [],
      };
    }

    case "get_active_sessions": {
      const { data } = await supabaseAdmin
        .from("customers")
        .select("id, full_name, phone, username, mac_address, expires_at")
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString());
      return data;
    }

    case "get_packages": {
      let query = supabaseAdmin
        .from("packages")
        .select("*")
        .order("price_kes", { ascending: true });
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return data;
    }

    case "get_revenue": {
      let query = supabaseAdmin
        .from("transactions")
        .select("amount_kes, created_at, status")
        .eq("status", "success");
      if (tenantId) query = query.eq("tenant_id", tenantId);
      const { data, error } = await query;
      if (error) throw new Error(error.message);

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const startOfWeek = now.getTime() - 7 * 24 * 3600 * 1000;
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

      let todayKES = 0;
      let weekKES = 0;
      let monthKES = 0;
      let totalKES = 0;

      for (const t of data || []) {
        const amt = t.amount_kes || 0;
        const time = new Date(t.created_at).getTime();
        totalKES += amt;
        if (time >= startOfToday) todayKES += amt;
        if (time >= startOfWeek) weekKES += amt;
        if (time >= startOfMonth) monthKES += amt;
      }

      return {
        today_kes: todayKES,
        week_kes: weekKES,
        month_kes: monthKES,
        total_kes: totalKES,
        successful_transactions_count: (data || []).length,
      };
    }

    case "search_system_logs": {
      const { data } = await supabaseAdmin
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return data;
    }

    case "create_customer": {
      const { full_name, phone, package_id } = args;
      const { data, error } = await supabaseAdmin
        .from("customers")
        .insert({
          tenant_id: tenantId,
          full_name,
          phone,
          package_id: package_id || null,
          status: "active",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { success: true, customer: data };
    }

    case "create_package": {
      const { name: pkgName, price_kes, duration_hours, speed_down_mbps, speed_up_mbps } = args;
      const { data, error } = await supabaseAdmin
        .from("packages")
        .insert({
          tenant_id: tenantId,
          name: pkgName,
          price_kes,
          duration_hours,
          speed_down_mbps: speed_down_mbps || 5,
          speed_up_mbps: speed_up_mbps || 5,
          is_active: true,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return { success: true, package: data };
    }

    case "activate_subscription":
    case "grant_customer_access": {
      const { customer_id, duration_hours } = args;
      const hours = duration_hours || 24;
      const expiresAt = new Date(Date.now() + hours * 3600 * 1000).toISOString();

      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .update({ status: "active", expires_at: expiresAt })
        .eq("id", customer_id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      // Queue command to router
      if (customer.router_id) {
        await supabaseAdmin.from("router_commands").insert({
          tenant_id: customer.tenant_id,
          router_id: customer.router_id,
          action: "GRANT_ACCESS",
          payload: { username: customer.username || customer.phone, mac: customer.mac_address },
          status: "queued",
        });
      }

      return {
        success: true,
        message: `Access granted to customer ${customer.full_name} (${customer.phone}) until ${expiresAt}`,
        customer,
      };
    }

    case "suspend_subscription":
    case "revoke_customer_access": {
      const { customer_id } = args;
      const { data: customer, error } = await supabaseAdmin
        .from("customers")
        .update({ status: "expired" })
        .eq("id", customer_id)
        .select()
        .single();

      if (error) throw new Error(error.message);

      if (customer.router_id) {
        await supabaseAdmin.from("router_commands").insert({
          tenant_id: customer.tenant_id,
          router_id: customer.router_id,
          action: "REVOKE_ACCESS",
          payload: { username: customer.username || customer.phone, mac: customer.mac_address },
          status: "queued",
        });
      }

      return {
        success: true,
        message: `Access revoked for customer ${customer.full_name}`,
        customer,
      };
    }

    case "generate_router_configuration": {
      const { router_id } = args;
      const { data: router } = await supabaseAdmin
        .from("routers")
        .select("*")
        .eq("id", router_id)
        .maybeSingle();
      if (!router) return { error: "Router not found" };
      return {
        router_name: router.name,
        command: `${buildMikrotikFetchCommand("https://wifibilling.site", `/api/public/mikrotik/onboard?token=${router.onboard_token}`, { dstPath: "onboard.auto.rsc" })}; /import onboard.auto.rsc`,
      };
    }

    case "diagnose_router": {
      const { router_id } = args;
      const { data: router } = await supabaseAdmin
        .from("routers")
        .select("*")
        .eq("id", router_id)
        .maybeSingle();
      if (!router) return { error: "Router not found" };

      const lastSeen = router.last_seen_at ? new Date(router.last_seen_at) : null;
      const now = new Date();
      const minsDiff = lastSeen ? Math.floor((now.getTime() - lastSeen.getTime()) / 60000) : 999;
      const isOnline = minsDiff < 3;

      return {
        router_id: router.id,
        name: router.name,
        status: isOnline ? "online" : "offline",
        last_seen_mins_ago: minsDiff,
        public_ip: router.public_ip || "Unknown",
        ros_version: router.ros_version || "Unknown",
        diagnosis: isOnline
          ? "Router heartbeat is active and responsive."
          : `Router went offline ${minsDiff} minutes ago. Likely cause: Loss of internet power, WAN link outage, or blocked DNS/HTTP heartbeat requests to the server. Check ethernet cabling and power supply on site.`,
      };
    }

    case "generate_report": {
      const { data: customers } = await supabaseAdmin.from("customers").select("status");
      const { data: routers } = await supabaseAdmin.from("routers").select("status");
      const { data: txns } = await supabaseAdmin
        .from("transactions")
        .select("amount_kes, status")
        .eq("status", "success");

      const totalRev = (txns || []).reduce((acc, curr) => acc + (curr.amount_kes || 0), 0);
      const activeCust = (customers || []).filter((c) => c.status === "active").length;
      const onlineRouters = (routers || []).filter((r) => r.status === "online").length;

      return {
        total_revenue_kes: totalRev,
        total_customers: customers?.length || 0,
        active_customers: activeCust,
        total_routers: routers?.length || 0,
        online_routers: onlineRouters,
        generated_at: new Date().toISOString(),
      };
    }

    case "get_ai_action_logs": {
      const { data } = await supabaseAdmin
        .from("ai_action_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(args.limit || 20);
      return data;
    }

    case "toggle_autonomous_mode": {
      const { enabled } = args;
      await supabaseAdmin.from("app_configurations").upsert(
        {
          key: "ai_autonomous_mode",
          value: JSON.stringify(enabled),
          description: "Autonomous AI Operations Mode",
          category: "ai",
        },
        { onConflict: "key" },
      );

      return { success: true, autonomous_mode: enabled };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
