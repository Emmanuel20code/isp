import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { normalizeKePhone, isValidKePhone } from "@/lib/billing-helpers";
import { RouterManagementService } from "@/lib/router-management.server";
import { getClientIp } from "@/lib/utils";

export type PortalPackage = {
  id: string;
  name: string;
  kind: "hotspot" | "pppoe";
  price_kes: number;
  duration_hours: number;
  speed_down_mbps: number;
  speed_up_mbps: number;
  device_limit: number;
};

export type PortalTenantSettings = {
  tenant_id: string;
  business_name: string;
  portal_title: string | null;
  portal_subtitle: string | null;
  brand_color: string;
  accent_color: string;
  theme_preset: "midnight" | "obsidian" | "sapphire" | "light";
  announcement_text: string | null;
  card_style: "pill" | "modern" | "minimal";
  logo_url: string | null;
  support_phone: string | null;
  support_email: string | null;
  terms_url: string | null;
};

export const getPortal = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        routerId: z.string().optional().nullable(),
        mac: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // First fetch tenant by slug
    const { data: tenantRow } = await supabaseAdmin
      .from("tenants")
      .select("id, name, is_active")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!tenantRow) return { tenant: null, packages: [] as PortalPackage[], activeSession: null };

    const [{ data: settingsRow }, { data: packages }] = await Promise.all([
      supabaseAdmin
        .from("tenant_settings")
        .select(
          "portal_title, portal_subtitle, brand_color, accent_color, theme_preset, announcement_text, card_style, logo_url, support_phone, support_email, terms_url",
        )
        .eq("tenant_id", tenantRow.id)
        .maybeSingle(),
      supabaseAdmin
        .from("packages")
        .select("*")
        .eq("tenant_id", tenantRow.id)
        .eq("is_active", true)
        .order("price_kes", { ascending: true }),
    ]);

    let activeSession = null;

    if (data.mac) {
      const normalizedMac = data.mac.trim().toUpperCase();
      // Check for active session tied to this MAC via customers table
      const { data: activeCustomer } = await supabaseAdmin
        .from("customers")
        .select("id, username, expires_at, package_id, packages(name)")
        .eq("tenant_id", tenantRow.id)
        .eq("mac_address", normalizedMac)
        .eq("status", "active")
        .gt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (activeCustomer) {
        const pkgName = Array.isArray(activeCustomer.packages)
          ? activeCustomer.packages[0]?.name
          : activeCustomer.packages?.name;

        activeSession = {
          code: activeCustomer.username,
          expiresAt: activeCustomer.expires_at,
          packageName: pkgName ?? "Active Plan",
        };
      }
    }

    return {
      tenant: {
        tenant_id: tenantRow.id,
        business_name: tenantRow.name,
        portal_title: settingsRow?.portal_title ?? null,
        portal_subtitle: settingsRow?.portal_subtitle ?? null,
        brand_color: settingsRow?.brand_color ?? "#00A8E8",
        accent_color: settingsRow?.accent_color ?? "#f97316",
        theme_preset:
          (settingsRow?.theme_preset as "midnight" | "obsidian" | "sapphire" | "light") ??
          "midnight",
        announcement_text: settingsRow?.announcement_text ?? null,
        card_style: (settingsRow?.card_style as "pill" | "modern" | "minimal") ?? "pill",
        logo_url: settingsRow?.logo_url ?? null,
        support_phone: settingsRow?.support_phone ?? null,
        support_email: settingsRow?.support_email ?? null,
        terms_url: settingsRow?.terms_url ?? null,
      } as PortalTenantSettings,
      packages: (packages ?? []) as PortalPackage[],
      activeSession,
      detectedIp: getClientIp(getRequest()) || data.ip || null,
    };
  });

export const lookupPPPoECustomer = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        query: z.string().min(2).max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!tenant) throw new Error("Portal not found");

    const cleanQuery = data.query.trim();
    let phoneNorm = cleanQuery;
    try {
      if (isValidKePhone(cleanQuery)) {
        phoneNorm = normalizeKePhone(cleanQuery);
      }
    } catch {
      // ignore
    }

    // Look up customer by username or phone
    const { data: customer } = await supabaseAdmin
      .from("customers")
      .select(
        `
        id,
        full_name,
        username,
        phone,
        status,
        expires_at,
        package_id,
        packages(id, name, price_kes, duration_hours, speed_down_mbps, speed_up_mbps),
        routers(name)
      `,
      )
      .eq("tenant_id", tenant.id)
      .eq("kind", "pppoe")
      .or(`username.ilike.${cleanQuery},phone.eq.${phoneNorm},phone.eq.${cleanQuery}`)
      .limit(1)
      .maybeSingle();

    if (!customer) {
      return { found: false, customer: null };
    }

    const pkg = Array.isArray(customer.packages) ? customer.packages[0] : customer.packages;
    const router = Array.isArray(customer.routers) ? customer.routers[0] : customer.routers;

    return {
      found: true,
      customer: {
        id: customer.id,
        fullName: customer.full_name,
        username: customer.username,
        phone: customer.phone,
        status: customer.status,
        expiresAt: customer.expires_at,
        packageId: customer.package_id,
        packageName: pkg?.name || null,
        routerName: router?.name || null,
      },
    };
  });

export const validatePortalRequest = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        routerId: z.string().optional().nullable(),
        mac: z.string().optional().nullable(),
        ip: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if tenant exists for slug
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();

    if (!tenant) return { valid: false, message: "Invalid portal configuration" };

    // Here you could add further validation, like checking if the router belongs to the tenant
    return { valid: true };
  });

export const startPortalPurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        packageId: z.string().uuid(),
        phone: z.string().min(9).max(20),
        username: z.string().optional().nullable(),
        customerId: z.string().uuid().optional().nullable(),
        routerId: z.string().uuid().optional().nullable(),
        mac: z.string().optional().nullable(),
        ip: z.string().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const phone = normalizeKePhone(data.phone);
    if (!isValidKePhone(phone)) {
      throw new Error("Enter a valid Safaricom phone number, e.g. 0712345678 or 0112345678");
    }

    const request = getRequest();
    const detectedIp = getClientIp(request) || data.ip || null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select(
        "id, slug, is_active, subscription_status, trial_end_at, subscription_end_at, mpesa_shortcode, mpesa_shortcode_kind, mpesa_account_ref",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (!tenant || !tenant.is_active) throw new Error("This hotspot is not available right now");

    // Enforce billing check: If tenant's trial or subscription is expired, block customer STK Push
    const { computeBillingState } = await import("@/lib/subscription");
    const billing = computeBillingState({
      subscription_status: tenant.subscription_status,
      trial_end_at: tenant.trial_end_at,
      subscription_end_at: tenant.subscription_end_at,
    });
    if (!billing.isEntitled) {
      throw new Error("This hotspot service is temporarily suspended due to subscription expiry.");
    }

    const { data: pkg } = await supabaseAdmin
      .from("packages")
      .select("id, name, price_kes, tenant_id, is_active")
      .eq("id", data.packageId)
      .eq("tenant_id", tenant.id)
      .maybeSingle();
    if (!pkg || !pkg.is_active) throw new Error("That package is no longer available");

    const origin = new URL(getRequest().url).origin;
    const { resolveCallbackUrl } = await import("@/lib/mpesa.server");
    const { stkPush } = await import("@/services/mpesa");
    const callbackUrl = await resolveCallbackUrl(origin);

    // Dynamic routing: customer Wi-Fi payments go to Tenant's M-Pesa Till/Paybill if saved
    if (!tenant.mpesa_shortcode) {
      throw new Error("This hotspot is not configured for payments. Please contact the owner.");
    }
    const isTill = tenant.mpesa_shortcode_kind === "till";
    const push = await stkPush({
      phone,
      amount: pkg.price_kes,
      accountReference: tenant.mpesa_account_ref || tenant.slug,
      description: "Internet",
      callbackUrl,
      partyB: isTill ? undefined : tenant.mpesa_shortcode,
      tillNumber: isTill ? tenant.mpesa_shortcode : undefined,
      transactionType: isTill ? "CustomerBuyGoodsOnline" : "CustomerPayBillOnline",
    });

    await supabaseAdmin.from("transactions").insert({
      tenant_id: tenant.id,
      package_id: pkg.id,
      kind: "customer_payment",
      status: "pending",
      phone,
      amount_kes: pkg.price_kes,
      checkout_request_id: push.checkoutRequestId,
      raw: {
        merchant_request_id: push.merchantRequestId,
        response_code: push.responseCode,
        source: "portal",
        router_id: data.routerId ?? null,
        username: data.username ?? null,
        customer_id: data.customerId ?? null,
        mac: data.mac ?? null,
        ip: detectedIp,
        business_shortcode: tenant.mpesa_shortcode ?? null,
      },
    });

    return {
      checkoutRequestId: push.checkoutRequestId,
      message: push.customerMessage,
      amount: pkg.price_kes,
    };
  });

export const getPortalPurchase = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ checkoutRequestId: z.string().min(4) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: txn } = await supabaseAdmin
      .from("transactions")
      .select("id, status, failure_reason, mpesa_receipt, voucher_id")
      .eq("checkout_request_id", data.checkoutRequestId)
      .eq("kind", "customer_payment")
      .maybeSingle();
    if (!txn) return { status: "pending" as const, code: null, receipt: null, failureReason: null };

    if (txn.status === "pending") {
      try {
        const { stkPushQuery } = await import("@/lib/mpesa.server");
        const queryRes = await stkPushQuery(data.checkoutRequestId, supabaseAdmin);

        if (queryRes.resultCode === "0") {
          const receipt =
            queryRes.raw?.CallbackMetadata?.Item?.find(
              (i: Record<string, unknown>) => i.Name === "MpesaReceiptNumber",
            )?.Value ?? null;

          console.log(
            `[PAYMENT_FLOW][1/5] Callback/Polling verified payment via Daraja STK Query: CheckoutRequestID=${data.checkoutRequestId}, Receipt=${receipt || "none"}`,
          );

          await supabaseAdmin
            .from("transactions")
            .update({
              status: "success",
              mpesa_receipt: receipt ? String(receipt) : null,
              failure_reason: null,
            })
            .eq("checkout_request_id", data.checkoutRequestId);

          const { activateCustomerPackage } = await import("@/lib/payments.functions");
          await activateCustomerPackage(supabaseAdmin, txn.id, receipt ? String(receipt) : null);

          // Re-fetch to get the newly created voucher_id
          const { data: freshTxn } = await supabaseAdmin
            .from("transactions")
            .select("status, failure_reason, mpesa_receipt, voucher_id")
            .eq("id", txn.id)
            .maybeSingle();

          if (freshTxn) {
            let code: string | null = null;
            let expiresAt: string | null = null;
            let packageName: string | null = null;

            if (freshTxn.voucher_id) {
              const { data: v } = await supabaseAdmin
                .from("vouchers")
                .select("code, expires_at, packages(name)")
                .eq("id", freshTxn.voucher_id)
                .maybeSingle();
              code = v?.code ?? null;
              expiresAt = v?.expires_at ?? null;
              packageName = Array.isArray(v?.packages) ? v?.packages[0]?.name : v?.packages?.name;
            }
            return {
              status: "success" as const,
              code,
              expiresAt,
              packageName: packageName ?? "Active Plan",
              receipt: freshTxn.mpesa_receipt,
              failureReason: null,
              isAuthorized: true,
            };
          }
        } else if (
          queryRes.resultCode === "1032" || // Cancelled by user
          queryRes.resultCode === "1" || // Insufficient funds
          queryRes.resultCode === "2001" || // Wrong PIN
          queryRes.resultCode === "1037" // Timeout expired
        ) {
          await supabaseAdmin
            .from("transactions")
            .update({
              status: "failed",
              failure_reason: queryRes.resultDesc || "Payment was not completed",
            })
            .eq("checkout_request_id", data.checkoutRequestId);

          return {
            status: "failed" as const,
            code: null,
            receipt: null,
            failureReason: queryRes.resultDesc || "Payment was not completed",
            isAuthorized: false,
          };
        }
      } catch (err) {
        // Ignore Daraja query errors to allow polling to continue seamlessly
      }
    }

    if (txn.status === "success" && !txn.voucher_id) {
      try {
        const { activateCustomerPackage } = await import("@/lib/payments.functions");
        await activateCustomerPackage(supabaseAdmin, txn.id, txn.mpesa_receipt);
        const { data: freshTxn } = await supabaseAdmin
          .from("transactions")
          .select("id, status, failure_reason, mpesa_receipt, voucher_id")
          .eq("id", txn.id)
          .maybeSingle();
        if (freshTxn?.voucher_id) {
          txn.voucher_id = freshTxn.voucher_id;
        }
      } catch (actErr) {
        console.error("[getPortalPurchase] On-demand activation error:", actErr);
      }
    }

    const effectiveStatus = txn.status;

    let code: string | null = null;
    let expiresAt: string | null = null;
    let packageName: string | null = null;

    if (txn.voucher_id) {
      const { data: v } = await supabaseAdmin
        .from("vouchers")
        .select("code, expires_at, packages(name)")
        .eq("id", txn.voucher_id)
        .maybeSingle();
      code = v?.code ?? null;
      expiresAt = v?.expires_at ?? null;
      packageName = Array.isArray(v?.packages) ? v?.packages[0]?.name : v?.packages?.name;
    }
    return {
      status: effectiveStatus as "pending" | "success" | "failed" | "cancelled",
      code,
      expiresAt,
      packageName: packageName ?? "Active Plan",
      receipt: txn.mpesa_receipt,
      failureReason: txn.failure_reason,
      isAuthorized: effectiveStatus === "success",
    };
  });

export const redeemPortalVoucher = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        slug: z.string().min(1).max(80),
        code: z.string().min(3).max(30),
        routerId: z.string().uuid().nullable().optional(),
        mac: z.string().nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("id, name, is_active")
      .eq("slug", data.slug)
      .maybeSingle();

    if (!tenant || !tenant.is_active) {
      throw new Error("This hotspot portal is currently unavailable.");
    }

    const cleanCode = data.code.trim().toUpperCase();

    const { data: voucher, error } = await supabaseAdmin
      .from("vouchers")
      .select(
        "id, code, status, expires_at, activated_at, package_id, phone, router_id, packages (id, name, duration_hours, speed_down_mbps, speed_up_mbps, device_limit, kind)",
      )
      .eq("tenant_id", tenant.id)
      .ilike("code", cleanCode)
      .maybeSingle();

    if (error || !voucher) {
      throw new Error("Invalid voucher code. Please check and try again.");
    }

    if (voucher.status === "expired") {
      throw new Error("This voucher code has expired.");
    }

    const pkg = Array.isArray(voucher.packages) ? voucher.packages[0] : voucher.packages;
    const durationHours = pkg?.duration_hours ?? 24;

    const targetRouterId = data.routerId || voucher.router_id || null;
    const mac = data.mac ? data.mac.trim().toUpperCase() : null;

    // If unused, activate it now
    if (voucher.status === "unused") {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationHours * 3_600_000).toISOString();

      // Find or create customer associated with this voucher
      let customerId: string | null = null;
      const { data: existingCustomer } = await supabaseAdmin
        .from("customers")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("username", voucher.code)
        .maybeSingle();

      if (existingCustomer) {
        customerId = existingCustomer.id;
        await supabaseAdmin
          .from("customers")
          .update({
            package_id: voucher.package_id,
            router_id: targetRouterId,
            mac_address: mac,
            expires_at: expiresAt,
            status: "active",
          })
          .eq("id", customerId);
      } else {
        const { data: newCustomer } = await supabaseAdmin
          .from("customers")
          .insert({
            tenant_id: tenant.id,
            full_name: `Voucher User ${voucher.code}`,
            phone: voucher.phone || "254700000000",
            kind: pkg?.kind ?? "hotspot",
            package_id: voucher.package_id,
            router_id: targetRouterId,
            username: voucher.code,
            mac_address: mac,
            expires_at: expiresAt,
            status: "active",
          })
          .select("id")
          .maybeSingle();
        customerId = newCustomer?.id ?? null;
      }

      await supabaseAdmin
        .from("vouchers")
        .update({
          status: "active",
          activated_at: now.toISOString(),
          expires_at: expiresAt,
          router_id: targetRouterId,
        })
        .eq("id", voucher.id);

      // Enqueue MikroTik commands for the activated voucher across applicable router(s)
      let targetRouterIds: string[] = targetRouterId ? [targetRouterId] : [];
      if (targetRouterIds.length === 0) {
        const { data: tenantRouters } = await supabaseAdmin
          .from("routers")
          .select("id")
          .eq("tenant_id", tenant.id);
        targetRouterIds = (tenantRouters || []).map((r: { id: string }) => r.id).filter(Boolean);
      }

      if (targetRouterIds.length > 0) {
        const routerManager = new RouterManagementService(supabaseAdmin);
        for (const rid of targetRouterIds) {
          if (pkg?.kind === "pppoe") {
            await routerManager.provisionUser({
              tenantId: tenant.id,
              routerId: rid,
              username: voucher.code,
              password: voucher.code,
              kind: "pppoe",
              profile: pkg?.name ?? "emmatech-pppoe-prof",
              rateLimit: `${pkg?.speed_up_mbps ?? 10}M/${pkg?.speed_down_mbps ?? 10}M`,
              comment: `Voucher ${voucher.code}`,
            });
          } else {
            await routerManager.provisionUser({
              tenantId: tenant.id,
              routerId: rid,
              username: voucher.code,
              password: voucher.code,
              kind: "hotspot",
              profile: pkg?.name ?? "default",
              limitUptimeHours: durationHours,
              rateLimit: `${pkg?.speed_up_mbps ?? 5}M/${pkg?.speed_down_mbps ?? 5}M`,
              sharedUsers: pkg?.device_limit ?? 1,
              macAddress: mac,
              comment: `Voucher ${voucher.code}`,
            });
          }
        }
      }

      await supabaseAdmin.from("audit_logs").insert({
        tenant_id: tenant.id,
        action: "portal.voucher_redeemed",
        entity_type: "voucher",
        entity_id: voucher.id,
        metadata: { code: voucher.code, durationHours, mac },
      });

      return {
        success: true,
        code: voucher.code,
        status: "active",
        expiresAt,
        packageName: pkg?.name ?? "Wi-Fi Plan",
        durationHours,
      };
    }

    // If already active, re-push MikroTik configuration just in case
    if (voucher.status === "active" && targetRouterId) {
      const routerManager = new RouterManagementService(supabaseAdmin);

      if (pkg?.kind === "pppoe") {
        await routerManager.provisionUser({
          tenantId: tenant.id,
          routerId: targetRouterId,
          username: voucher.code,
          password: voucher.code,
          kind: "pppoe",
          profile: pkg?.name ?? "emmatech-pppoe-prof",
          comment: `Voucher ${voucher.code} (Re-push)`,
        });
      } else {
        await routerManager.provisionUser({
          tenantId: tenant.id,
          routerId: targetRouterId,
          username: voucher.code,
          password: voucher.code,
          kind: "hotspot",
          profile: pkg?.name ?? "default",
          limitUptimeHours: durationHours,
          rateLimit: `${pkg?.speed_up_mbps ?? 5}M/${pkg?.speed_down_mbps ?? 5}M`,
          sharedUsers: pkg?.device_limit ?? 1,
          macAddress: mac,
          comment: `Voucher ${voucher.code} (Re-push)`,
        });
      }
    }

    return {
      success: true,
      code: voucher.code,
      status: voucher.status,
      expiresAt: voucher.expires_at,
      packageName: pkg?.name ?? "Wi-Fi Plan",
      durationHours,
    };
  });
