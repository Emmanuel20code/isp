// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";

type CallbackItem = { Name: string; Value?: string | number };

function ok() {
  return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/public/mpesa/callback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: Record<string, unknown>;
        try {
          payload = await request.json();
        } catch {
          return ok();
        }

        const cb =
          (payload?.Body as Record<string, unknown>)?.stkCallback ||
          (payload?.Body as Record<string, unknown>)?.stkPushCallback;
        const checkoutRequestId: string | undefined = (cb as Record<string, unknown>)
          ?.CheckoutRequestID as string | undefined;
        if (!checkoutRequestId) return ok();

        const items: CallbackItem[] = cb?.CallbackMetadata?.Item ?? [];
        const meta: Record<string, string | number> = {};
        for (const item of items) {
          if (item?.Name) {
            meta[item.Name] = item.Value ?? "";
            meta[item.Name.toLowerCase()] = item.Value ?? "";
          }
        }
        const success = cb?.ResultCode === 0;
        const receiptNumber =
          (meta["MpesaReceiptNumber"] as string) || (meta["mpesareceiptnumber"] as string) || null;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: txn } = await supabaseAdmin
          .from("transactions")
          .select("id, tenant_id, kind, status, package_id, phone, raw, mpesa_receipt")
          .eq("checkout_request_id", checkoutRequestId)
          .maybeSingle();

        if (!txn) {
          console.warn(
            `[mpesa-callback] No transaction found for checkoutRequestId: ${checkoutRequestId}`,
          );
          return ok();
        }

        const wasPending = txn.status === "pending";

        // 1. Atomic status claim to prevent double-activation race condition
        const { data: claimedTxn } = await supabaseAdmin
          .from("transactions")
          .update({ status: success ? "success" : "failed" })
          .eq("id", txn.id)
          .eq("status", "pending")
          .select("id")
          .maybeSingle();

        const wonActivationRace = !!claimedTxn;

        // 2. Always update metadata (receipt, callback JSON) safely
        await supabaseAdmin
          .from("transactions")
          .update({
            mpesa_receipt: receiptNumber ?? txn.mpesa_receipt,
            failure_reason: success ? null : (cb?.ResultDesc ?? "Payment not completed"),
            raw: {
              ...(typeof txn.raw === "object" && txn.raw ? txn.raw : {}),
              callback: payload,
              callback_received_at: new Date().toISOString(),
            },
          })
          .eq("id", txn.id);

        if (success && txn.kind === "saas_subscription" && txn.tenant_id && wonActivationRace) {
          const { activateTenantSubscription } = await import("@/lib/payments.functions");
          const actResult = await activateTenantSubscription(
            supabaseAdmin,
            txn.tenant_id,
            txn.id,
            receiptNumber ?? txn.mpesa_receipt ?? null,
          );
          console.log(
            `[mpesa-callback] Automated SaaS subscription activation for tenant ${txn.tenant_id} (Receipt: ${receiptNumber}):`,
            actResult,
          );
        }

        if (success && txn.kind === "customer_payment" && txn.package_id && wonActivationRace) {
          try {
            const { activateCustomerPackage } = await import("@/lib/payments.functions");
            await activateCustomerPackage(
              supabaseAdmin,
              txn.id,
              receiptNumber ?? txn.mpesa_receipt ?? null,
            );
            console.log(
              `[mpesa-callback] Successfully activated customer package for transaction ${txn.id}.`,
            );
          } catch (actErr) {
            console.error("[mpesa-callback] Customer package activation error:", actErr);
          }
        }

        return ok();
      },
    },
  },
});
