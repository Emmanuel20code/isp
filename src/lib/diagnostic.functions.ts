import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const diagnoseTenantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ tenantId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { tenantId } = data;

    const now = new Date();
    const nowIso = now.toISOString();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    console.log(`[Diagnostic] ==========================================`);
    console.log(`[Diagnostic] Running subscription diagnostics for tenant: ${tenantId}`);
    console.log(`[Diagnostic] Current timestamp: ${nowIso}`);
    console.log(`[Diagnostic] Current month start: ${startOfMonth}`);

    // 1. Fetch tenant state
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, slug, subscription_status, subscription_start_at, subscription_end_at, trial_end_at, is_active",
      )
      .eq("id", tenantId)
      .maybeSingle();

    if (tenantErr || !tenant) {
      console.error(`[Diagnostic] Tenant not found or error:`, tenantErr);
      return { success: false, reason: "Tenant not found", error: tenantErr?.message };
    }

    console.log(`[Diagnostic] Tenant Record:`, JSON.stringify(tenant, null, 2));

    // 2. Fetch all successful SaaS subscription transactions for the current month
    const { data: monthTxns, error: txnsErr } = await supabaseAdmin
      .from("transactions")
      .select("id, amount_kes, mpesa_receipt, status, kind, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "saas_subscription")
      .eq("status", "success")
      .gte("created_at", startOfMonth)
      .order("created_at", { ascending: false });

    if (txnsErr) {
      console.error(`[Diagnostic] Error fetching current month transactions:`, txnsErr);
    }

    console.log(
      `[Diagnostic] Successful SaaS subscription transactions this month (${monthTxns?.length ?? 0}):`,
      JSON.stringify(monthTxns, null, 2),
    );

    // 3. Fetch all successful SaaS subscription transactions overall
    const { data: allTxns } = await supabaseAdmin
      .from("transactions")
      .select("id, amount_kes, mpesa_receipt, status, kind, created_at")
      .eq("tenant_id", tenantId)
      .eq("kind", "saas_subscription")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(10);

    console.log(
      `[Diagnostic] Recent successful SaaS transactions (overall top 10):`,
      JSON.stringify(allTxns, null, 2),
    );

    const currentEndMs = tenant.subscription_end_at
      ? new Date(tenant.subscription_end_at).getTime()
      : 0;
    const nowMs = now.getTime();
    const hasPaidThisMonth = monthTxns && monthTxns.length > 0;
    const isFutureActive = currentEndMs > nowMs;

    const analysis = {
      tenantId,
      tenantName: tenant.name,
      status: tenant.subscription_status,
      isActive: tenant.is_active,
      subscriptionEndAt: tenant.subscription_end_at,
      trialEndAt: tenant.trial_end_at,
      currentMonthTransactionsCount: monthTxns?.length ?? 0,
      currentMonthTransactions: monthTxns ?? [],
      recentTransactions: allTxns ?? [],
      isFutureActive,
      hasPaidThisMonth,
      redundantRenewalPrevented: isFutureActive && hasPaidThisMonth,
      recommendation:
        isFutureActive && hasPaidThisMonth
          ? "Subscription is active in the future and payment already processed this month. Redundant updates are successfully blocked."
          : "Subscription may be expired or no payment recorded yet for this month.",
    };

    console.log(`[Diagnostic] Analysis Result:`, JSON.stringify(analysis, null, 2));
    console.log(`[Diagnostic] ==========================================`);

    return {
      success: true,
      diagnostic: analysis,
    };
  });

export const getSubscriptionDiagnosticsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: platform } = await supabaseAdmin
      .from("platform_settings")
      .select("subscription_price_kes, subscription_days")
      .maybeSingle();

    const price = platform?.subscription_price_kes ?? 1500;
    const defaultDays = platform?.subscription_days ?? 30;

    const { data: tenants, error: tenantsErr } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, slug, subscription_status, subscription_start_at, subscription_end_at, trial_end_at, is_active",
      );

    if (tenantsErr || !tenants) {
      return { success: false, error: tenantsErr?.message, items: [] };
    }

    const now = new Date();
    const nowMs = now.getTime();

    const diagnostics = [];

    for (const tenant of tenants) {
      // Fetch successful SaaS subscription transactions with mpesa receipts
      const { data: txns } = await supabaseAdmin
        .from("transactions")
        .select("id, amount_kes, mpesa_receipt, status, kind, created_at")
        .eq("tenant_id", tenant.id)
        .eq("kind", "saas_subscription")
        .eq("status", "success")
        .order("created_at", { ascending: true });

      const verifiedReceipts = (txns ?? []).filter(
        (t) => t.mpesa_receipt && t.mpesa_receipt.trim() !== "",
      );
      const totalReceiptsCount = verifiedReceipts.length;
      let totalPaidKes = 0;
      let expectedDaysFromReceipts = 0;

      for (const t of verifiedReceipts) {
        const amt = t.amount_kes ?? price;
        totalPaidKes += amt;
        expectedDaysFromReceipts += Math.max(1, Math.round((amt / price) * 30));
      }

      // Calculate active / remaining subscription days in DB
      let remainingDays = 0;
      const endMs = tenant.subscription_end_at ? new Date(tenant.subscription_end_at).getTime() : 0;
      if (endMs > nowMs) {
        remainingDays = Math.ceil((endMs - nowMs) / 86_400_000);
      }

      const isExpired = endMs < nowMs;
      const discrepancies: string[] = [];

      // Check discrepancies
      if (tenant.subscription_status === "active" && isExpired) {
        discrepancies.push("Status is 'active' but subscription end date is in the past");
      }
      if (totalReceiptsCount > 0 && isExpired && tenant.subscription_status === "expired") {
        discrepancies.push("Has verified M-Pesa receipts but subscription is marked 'expired'");
      }
      if (
        totalReceiptsCount === 0 &&
        tenant.subscription_status === "active" &&
        !tenant.trial_end_at
      ) {
        discrepancies.push("Active subscription with zero verified M-Pesa receipts");
      }

      diagnostics.push({
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        status: tenant.subscription_status,
        isActive: tenant.is_active,
        subscriptionEndAt: tenant.subscription_end_at,
        remainingDays,
        totalReceiptsCount,
        verifiedReceipts: verifiedReceipts.map((r) => r.mpesa_receipt),
        totalPaidKes,
        expectedDaysFromReceipts,
        discrepancies,
        hasDiscrepancy: discrepancies.length > 0,
      });
    }

    return {
      success: true,
      diagnostics,
    };
  });

export const diagnoseTenantByQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ query: z.string().min(1) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { query } = data;
    const cleanQuery = query.toLowerCase().trim();

    console.log(`[Diagnostic Search] Searching tenants for query: "${cleanQuery}"`);

    // 1. Find tenants matching name, slug, or associated user email via tenant_users / profiles
    const { data: tenants, error: tenantErr } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, name, slug, subscription_status, subscription_start_at, subscription_end_at, trial_end_at, is_active",
      );

    if (tenantErr || !tenants) {
      return { success: false, error: tenantErr?.message || "Failed to fetch tenants" };
    }

    const matchedTenants = tenants.filter(
      (t) =>
        t.name.toLowerCase().includes(cleanQuery) ||
        t.slug.toLowerCase().includes(cleanQuery) ||
        t.id.toLowerCase() === cleanQuery,
    );

    // Also search tenant users if query looks like email
    let userTenantIds: string[] = [];
    if (cleanQuery.includes("@")) {
      // Find auth user ID by email or search profiles/tenant_users
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .ilike("email", `%${cleanQuery}%`);

      if (profiles && profiles.length > 0) {
        const userIds = profiles.map((p) => p.id);
        const { data: tMembers } = await supabaseAdmin
          .from("tenant_users")
          .select("tenant_id")
          .in("user_id", userIds);

        if (tMembers) {
          userTenantIds = tMembers.map((m) => m.tenant_id);
        }
      }
    }

    const allMatchedIds = Array.from(
      new Set([...matchedTenants.map((t) => t.id), ...userTenantIds]),
    );

    const finalTenants = tenants.filter((t) => allMatchedIds.includes(t.id));

    if (finalTenants.length === 0) {
      return {
        success: true,
        query,
        found: 0,
        message: `No tenants found matching "${query}".`,
        results: [],
      };
    }

    const results = [];

    for (const tenant of finalTenants) {
      // Fetch successful SaaS transactions
      const { data: txns } = await supabaseAdmin
        .from("transactions")
        .select("id, amount_kes, mpesa_receipt, status, kind, created_at")
        .eq("tenant_id", tenant.id)
        .eq("kind", "saas_subscription")
        .eq("status", "success")
        .order("created_at", { ascending: false });

      const verifiedReceipts = (txns ?? []).filter(
        (t) => t.mpesa_receipt && t.mpesa_receipt.trim() !== "",
      );

      const nowMs = Date.now();
      const endMs = tenant.subscription_end_at ? new Date(tenant.subscription_end_at).getTime() : 0;
      const remainingDays = endMs > nowMs ? Math.ceil((endMs - nowMs) / 86_400_000) : 0;

      results.push({
        tenantId: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        subscriptionStatus: tenant.subscription_status,
        isActive: tenant.is_active,
        subscriptionStartAt: tenant.subscription_start_at,
        subscriptionEndAt: tenant.subscription_end_at,
        trialEndAt: tenant.trial_end_at,
        remainingDays,
        totalReceiptsCount: verifiedReceipts.length,
        verifiedReceipts: verifiedReceipts.map((r) => ({
          id: r.id,
          receipt: r.mpesa_receipt,
          amountKes: r.amount_kes,
          createdAt: r.created_at,
        })),
        allTransactions: txns ?? [],
      });
    }

    console.log(`[Diagnostic Search] Found ${results.length} tenants for query "${query}".`);

    return {
      success: true,
      query,
      found: results.length,
      results,
    };
  });
