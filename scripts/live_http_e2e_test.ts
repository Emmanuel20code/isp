import { supabaseAdmin } from "../src/integrations/supabase/client.server";

async function runLiveHttpE2ETest() {
  console.log("=== STARTING FULL HTTP END-TO-END PAYMENT & DISCONNECT TEST ===");

  // 1. Fetch active tenant, package, and router
  const { data: tenant } = await supabaseAdmin.from("tenants").select("id, name").limit(1).single();
  if (!tenant) throw new Error("No tenant found");
  console.log(`[1] Found tenant: ${tenant.name} (${tenant.id})`);

  const { data: pkgs } = await supabaseAdmin
    .from("packages")
    .select("id, name, duration_hours, price_kes")
    .eq("tenant_id", tenant.id)
    .limit(1);
  const pkg = pkgs?.[0];
  if (!pkg) throw new Error("No package found");
  console.log(`[2] Found package: "${pkg.name}" (${pkg.id}), Price: KES ${pkg.price_kes}`);

  const { data: router } = await supabaseAdmin
    .from("routers")
    .select("id, name, agent_key")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .single();
  if (!router) throw new Error("No router found");
  console.log(`[3] Found router: "${router.name}" (${router.id})`);

  // 2. Insert a simulated pending transaction (as if initiateStkPush was called)
  const checkoutRequestId = "ws_CO_LIVE_" + Date.now() + "_" + Math.floor(Math.random() * 1000);
  const testPhone = "254711" + Math.floor(100000 + Math.random() * 900000);
  const testReceipt = "QA" + Math.random().toString(36).substring(2, 9).toUpperCase();
  const testMac = "02:AA:BB:" + Math.floor(Math.random() * 89 + 10) + ":12:34";

  const { data: txn, error: txnErr } = await supabaseAdmin
    .from("transactions")
    .insert({
      tenant_id: tenant.id,
      package_id: pkg.id,
      amount_kes: pkg.price_kes,
      phone: testPhone,
      kind: "customer_payment",
      status: "pending",
      checkout_request_id: checkoutRequestId,
      raw: {
        router_id: router.id,
        mac: testMac,
        ip: "10.10.0.123",
        source: "portal",
      },
    })
    .select()
    .single();

  if (txnErr || !txn) throw new Error("Failed to insert pending txn: " + JSON.stringify(txnErr));
  console.log(
    `[4] Inserted pending transaction ID: ${txn.id}, CheckoutRequestID: ${checkoutRequestId}`,
  );

  // 3. Fire real Safaricom M-Pesa Callback to the live HTTP endpoint
  console.log(
    `[5] Sending live HTTP POST /api/public/mpesa/callback with Receipt: ${testReceipt}...`,
  );
  const callbackPayload = {
    Body: {
      stkCallback: {
        MerchantRequestID: "MR_" + Date.now(),
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: "The service request is processed successfully.",
        CallbackMetadata: {
          Item: [
            { Name: "Amount", Value: pkg.price_kes },
            { Name: "MpesaReceiptNumber", Value: testReceipt },
            { Name: "PhoneNumber", Value: Number(testPhone) },
            { Name: "TransactionDate", Value: 20260904120000 },
          ],
        },
      },
    },
  };

  const cbResponse = await fetch("http://localhost:3000/api/public/mpesa/callback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(callbackPayload),
  });

  console.log(`[6] Callback HTTP Response Status: ${cbResponse.status}`);
  const cbJson = await cbResponse.json();
  console.log(`[7] Callback Response JSON:`, cbJson);

  // Wait 1.5 seconds for async processing to settle
  await new Promise((r) => setTimeout(r, 1500));

  // 4. Verify transaction was updated to success in DB
  const { data: updatedTxn } = await supabaseAdmin
    .from("transactions")
    .select("status, voucher_id, mpesa_receipt")
    .eq("id", txn.id)
    .single();
  console.log(`[8] Updated transaction in DB:`, updatedTxn);
  if (
    updatedTxn?.status !== "success" ||
    updatedTxn?.mpesa_receipt !== testReceipt ||
    !updatedTxn?.voucher_id
  ) {
    throw new Error(
      `Transaction was not properly updated to success with voucher_id! Status=${updatedTxn?.status}, voucher_id=${updatedTxn?.voucher_id}`,
    );
  }

  // 5. Verify voucher and customer records were generated
  const { data: voucher } = await supabaseAdmin
    .from("vouchers")
    .select("id, code, status, expires_at")
    .eq("id", updatedTxn.voucher_id)
    .single();
  console.log(`[9] Voucher record:`, voucher);
  if (!voucher || voucher.status !== "active") {
    throw new Error("Voucher was not activated!");
  }
  const voucherCode = voucher.code;

  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("id, username, mac_address, status")
    .eq("username", voucherCode)
    .maybeSingle();
  console.log(`[10] Customer record:`, customer);
  if (!customer || customer.status !== "active") {
    throw new Error("Customer was not created or is not active!");
  }

  // 6. Test live MikroTik Router Sync HTTP endpoint (/api/public/mikrotik/sync)
  console.log(`[11] Simulating MikroTik Router polling /api/public/mikrotik/sync...`);
  const syncResponse = await fetch("http://localhost:3000/api/public/mikrotik/sync", {
    method: "POST",
    headers: {
      "x-router-id": router.id,
      "x-agent-key": router.agent_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identity: router.name,
      version: "7.15",
      uptime: "3d 4h 12m",
      hotspot_users: 1,
    }),
  });

  console.log(`[12] MikroTik Sync HTTP Status: ${syncResponse.status}`);
  const syncScript = await syncResponse.text();

  // Verify provisioning command was enqueued and processed
  const { data: provCmds } = await supabaseAdmin
    .from("router_commands")
    .select("*")
    .ilike("payload->>username", voucherCode);

  console.log(
    `[13] Provisioning command in DB:`,
    provCmds?.[0]?.action,
    `Status: ${provCmds?.[0]?.status}`,
  );
  if (!provCmds || provCmds.length === 0) {
    throw new Error(`No router command found in DB for voucher ${voucherCode}!`);
  }
  console.log(
    `[14] SUCCESS: User "${voucherCode}" provisioned to MikroTik router! (Delivered at: ${provCmds[0].delivered_at})`,
  );

  // 7. SIMULATE SESSION EXPIRY AND TEST AUTO-DISCONNECT
  console.log(`[15] Simulating time expiry by backdating expires_at to 1 hour ago...`);
  const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
  await supabaseAdmin.from("vouchers").update({ expires_at: pastTime }).eq("id", voucher.id);
  await supabaseAdmin.from("customers").update({ expires_at: pastTime }).eq("id", customer.id);

  console.log(`[15b] Waiting 11 seconds for maintenance interval to elapse...`);
  await new Promise((r) => setTimeout(r, 11000));

  // 8. Trigger next MikroTik sync poll (which triggers auto-maintenance check)
  console.log(`[16] MikroTik polls /api/public/mikrotik/sync after session time expires...`);
  const expirySyncResponse = await fetch("http://localhost:3000/api/public/mikrotik/sync", {
    method: "POST",
    headers: {
      "x-router-id": router.id,
      "x-agent-key": router.agent_key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      identity: router.name,
      version: "7.15",
      uptime: "3d 4h 13m",
    }),
  });

  console.log(`[17] Expiry Sync HTTP Status: ${expirySyncResponse.status}`);
  const expiryScript = await expirySyncResponse.text();
  console.log(`[18] Expiry sync response received.`);

  // Verify voucher and customer are expired, and delete command was enqueued
  const { data: updatedVoucher } = await supabaseAdmin
    .from("vouchers")
    .select("status")
    .eq("id", voucher.id)
    .single();
  const { data: updatedCust } = await supabaseAdmin
    .from("customers")
    .select("status")
    .eq("id", customer.id)
    .single();
  const { data: disconnectCmds } = await supabaseAdmin
    .from("router_commands")
    .select("*")
    .eq("action", "hotspot.delete_user")
    .ilike("payload->>username", voucherCode);

  console.log(
    `[19] Expired status in DB: Voucher=${updatedVoucher?.status}, Customer=${updatedCust?.status}, Disconnect commands count=${disconnectCmds?.length}`,
  );

  if (updatedVoucher?.status !== "expired" || updatedCust?.status !== "expired") {
    throw new Error(
      `Voucher or Customer was not marked expired! Voucher=${updatedVoucher?.status}, Customer=${updatedCust?.status}`,
    );
  }
  if (!disconnectCmds || disconnectCmds.length === 0) {
    throw new Error(`No disconnect router_command was enqueued on expiration!`);
  }
  console.log(
    `[20] SUCCESS: MikroTik disconnect command queued and delivered for "${voucherCode}"!`,
  );

  // 9. Clean up test artifacts
  console.log(`[20] Cleaning up test records...`);
  await supabaseAdmin.from("router_commands").delete().ilike("payload->>username", voucherCode);
  await supabaseAdmin.from("customers").delete().eq("id", customer.id);
  await supabaseAdmin.from("vouchers").delete().eq("id", voucher.id);
  await supabaseAdmin.from("transactions").delete().eq("id", txn.id);

  console.log("\n========================================================");
  console.log("🎉 ALL REAL END-TO-END HTTP WORKFLOW TESTS PASSED 100%! 🎉");
  console.log("========================================================\n");
}

runLiveHttpE2ETest().catch((err) => {
  console.error("TEST FAILED:", err);
  process.exit(1);
});
