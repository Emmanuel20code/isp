import { createFileRoute } from "@tanstack/react-router";
import { normalizeKePhone } from "@/lib/billing-helpers";

function ok() {
  return new Response(
    JSON.stringify({
      ResultCode: 0,
      ResultDesc: "Accepted",
    }),
    {
      status: 200,
      headers: { "content-type": "application/json" },
    },
  );
}

export const Route = createFileRoute("/api/public/mpesa/c2b")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, unknown>;
        try {
          payload = await request.json();
        } catch {
          return ok();
        }

        const transId = String(payload.TransID || "").trim();
        const transAmount = parseFloat(String(payload.TransAmount || "0"));
        const rawMsisdn = String(payload.MSISDN || "").trim();
        const billRef = String(payload.BillRefNumber || "")
          .trim()
          .toLowerCase();

        if (!transId || transAmount <= 0) {
          return ok();
        }

        const phone = normalizeKePhone(rawMsisdn);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Idempotency: check if transaction with this mpesa receipt already exists
        const { data: existingTxn } = await supabaseAdmin
          .from("transactions")
          .select("id, tenant_id, status")
          .eq("mpesa_receipt", transId)
          .maybeSingle();

        if (existingTxn) {
          return ok();
        }

        // 1. Try finding tenant by BillRefNumber (slug, business name, or ID)
        let tenantId: string | null = null;
        if (billRef) {
          const { data: tenantBySlug } = await supabaseAdmin
            .from("tenants")
            .select("id")
            .ilike("slug", `%${billRef}%`)
            .maybeSingle();

          if (tenantBySlug?.id) {
            tenantId = tenantBySlug.id;
          }
        }

        // 2. If not found by slug, search by business_phone or owner's phone
        if (!tenantId && phone) {
          const { data: tenantByPhone } = await supabaseAdmin
            .from("tenants")
            .select("id")
            .ilike("business_phone", `%${phone.slice(-9)}%`)
            .maybeSingle();

          if (tenantByPhone?.id) {
            tenantId = tenantByPhone.id;
          } else {
            // Check profiles and tenant_members
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .ilike("phone", `%${phone.slice(-9)}%`)
              .maybeSingle();

            if (profile?.id) {
              const { data: member } = await supabaseAdmin
                .from("tenant_members")
                .select("tenant_id")
                .eq("user_id", profile.id)
                .maybeSingle();
              if (member?.tenant_id) {
                tenantId = member.tenant_id;
              }
            }
          }
        }

        if (!tenantId) {
          console.warn(
            `[mpesa-c2b] Received payment KES ${transAmount} (${transId}) but could not match to a tenant (ref: ${billRef}, phone: ${phone})`,
          );
          return ok();
        }

        // Record successful SaaS payment transaction
        const { data: newTxn, error: txnErr } = await supabaseAdmin
          .from("transactions")
          .insert({
            tenant_id: tenantId,
            kind: "saas_subscription",
            status: "success",
            phone,
            amount_kes: transAmount,
            mpesa_receipt: transId,
            raw: {
              c2b_payload: payload,
              source: "c2b_confirmation",
              received_at: new Date().toISOString(),
            },
          })
          .select("id")
          .single();

        if (!txnErr && newTxn) {
          const { activateTenantSubscription } = await import("@/lib/payments.functions");
          await activateTenantSubscription(supabaseAdmin, tenantId, newTxn.id, transId);
          console.log(
            `[mpesa-c2b] Automatically activated SaaS subscription for tenant ${tenantId} via C2B (Receipt: ${transId})`,
          );
        }

        return ok();
      },
    },
  },
});
