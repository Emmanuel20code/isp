import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { activateCustomerPackage } from "../src/lib/payments.functions";
import { runBackgroundMaintenance } from "../src/lib/maintenance.server";

async function runEndToEndLifecycle() {
  console.log("=== [E2E TEST] STARTING REAL WORKFLOW TEST ===");

  // 1. Fetch active tenant, package, and router
  const { data: tenant, error: tErr } = await supabaseAdmin
    .from("tenants")
    .select("id, name")
    .limit(1)
    .single();
  if (tErr || !tenant) throw new Error("No active tenant found: " + JSON.stringify(tErr));
  console.log(`[1] Active Tenant: ${tenant.name} (${tenant.id})`);

  const { data: pkg, error: pErr } = await supabaseAdmin
    .from("packages")
    .select("id, name, duration_hours, price, speed_down_mbps, speed_up_mbps")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .single();
  if (pErr || !pkg) throw new Error("No package found: " + JSON.stringify(pErr));
  console.log(
    `[2] Selected Package: "${pkg.name}", Duration: ${pkg.duration_hours}h, Price: KES ${pkg.price}`,
  );

  const { data: router } = await supabaseAdmin
    .from("routers")
    .select("id, name, agent_key")
    .eq("tenant_id", tenant.id)
    .limit(1)
    .maybeSingle();
  console.log(
    `[3] Target Router: ${router ? `${router.name} (${router.id})` : "None (will provision across tenant routers)"}`,
  );

  // 2. Simulate customer M-Pesa STK push transaction initiation
  const testPhone = "2547" + Math.floor(10000000 + Math.random() * 90000000);
  const testReceipt = "QA" + Math.random().toString(36).substring(2, 9).toUpperCase();
  const testMac = "02:00:00:" + Math.floor(Math.random() * 89 + 10) + ":11:22";

  const { data: txn, error: txnErr } = await supabaseAdmin
    .from("transactions")
    .insert({
      tenant_id: tenant.id,
      package_id: pkg.id,
      router_id: router?.id || null,
      amount: pkg.price,
      phone: testPhone,
      kind: "customer_payment",
      status: "pending",
      checkout_request_id: "ws_CO_E2E_" + Date.now(),
      account_reference: "E2E-TEST",
      notes: JSON.stringify({ mac: testMac, ip: "10.10.0.155" }),
    })
    .select()
    .single();

  if (txnErr || !txn) throw new Error("Failed to insert transaction: " + JSON.stringify(txnErr));
  console.log(`[4] Created pending transaction: ${txn.id}, Phone: ${testPhone}`);

  // 3. Simulate callback handling -> activateCustomerPackage
  console.log(`[5] Processing Safaricom callback with Receipt: ${testReceipt}...`);
  const activation = await activateCustomerPackage(supabaseAdmin, txn.id, testReceipt);
  console.log(`[6] Activation result:`, activation);

  if (!activation.success || !activation.voucher) {
    throw new Error("activateCustomerPackage failed: " + JSON.stringify(activation));
  }
  const voucherCode = activation.voucher.code;
  console.log(`[7] Voucher issued successfully: CODE = ${voucherCode}`);

  // 4. Verify transaction status in database
  const { data: verifiedTxn } = await supabaseAdmin
    .from("transactions")
    .select("status, voucher_id, mpesa_receipt")
    .eq("id", txn.id)
    .single();
  if (verifiedTxn?.status !== "success" || verifiedTxn?.mpesa_receipt !== testReceipt) {
    throw new Error(`Transaction verification failed: status=${verifiedTxn?.status}`);
  }
  console.log(`[8] Verified Transaction updated to status "success" with receipt ${testReceipt}`);

  // 5. Verify customer created with MAC address and package
  const { data: customer } = await supabaseAdmin
    .from("customers")
    .select("id, username, mac_address, status, expires_at")
    .eq("username", voucherCode)
    .maybeSingle();
  if (!customer || customer.status !== "active") {
    throw new Error("Customer record verification failed: " + JSON.stringify(customer));
  }
  console.log(
    `[9] Customer created: ID=${customer.id}, MAC=${customer.mac_address}, Status=${customer.status}, Expires=${customer.expires_at}`,
  );

  // 6. Verify provisioning router command enqueued
  const { data: provisionCmds } = await supabaseAdmin
    .from("router_commands")
    .select("id, action, payload, status")
    .eq("tenant_id", tenant.id)
    .ilike("payload->>username", voucherCode);

  if (!provisionCmds || provisionCmds.length === 0) {
    throw new Error("No router commands were enqueued for provision!");
  }
  console.log(
    `[10] Provisioning router commands enqueued: count=${provisionCmds.length}, actions=${provisionCmds.map((c) => c.action).join(", ")}`,
  );

  // 7. Verify router sync script generation
  if (router) {
    console.log(`[11] Testing MikroTik router sync consumption for router ${router.id}...`);
    // Query queued commands for this router
    const { data: pendingForRouter } = await supabaseAdmin
      .from("router_commands")
      .select("id, action, payload")
      .eq("router_id", router.id)
      .eq("status", "queued")
      .ilike("payload->>username", voucherCode);
    console.log(`[12] Commands queued for target router: count=${pendingForRouter?.length || 0}`);
  }

  // 8. SIMULATE TIME EXPIRATION (Session Expiry Workflow)
  console.log(`[13] Simulating time expiration by setting expires_at to 10 minutes ago...`);
  const pastTimestamp = new Date(Date.now() - 600 * 1000).toISOString();
  await supabaseAdmin
    .from("vouchers")
    .update({ expires_at: pastTimestamp })
    .eq("id", activation.voucher.id);
  await supabaseAdmin.from("customers").update({ expires_at: pastTimestamp }).eq("id", customer.id);

  // 9. Execute maintenance engine to trigger session expiry & disconnect
  console.log(`[14] Running background maintenance engine to process session expirations...`);
  const maintResult = await runBackgroundMaintenance(true);
  console.log(`[15] Maintenance execution metrics:`, maintResult);

  // 10. Verify voucher was marked expired
  const { data: expiredVoucher } = await supabaseAdmin
    .from("vouchers")
    .select("status")
    .eq("id", activation.voucher.id)
    .single();
  if (expiredVoucher?.status !== "expired") {
    throw new Error(
      `Voucher did not transition to expired! Current status: ${expiredVoucher?.status}`,
    );
  }
  console.log(`[16] Verified voucher transitioned to status: "expired"`);

  // 11. Verify customer was marked expired
  const { data: expiredCust } = await supabaseAdmin
    .from("customers")
    .select("status")
    .eq("id", customer.id)
    .single();
  if (expiredCust?.status !== "expired") {
    throw new Error(
      `Customer did not transition to expired! Current status: ${expiredCust?.status}`,
    );
  }
  console.log(`[17] Verified customer transitioned to status: "expired"`);

  // 12. Verify disconnect command was enqueued to MikroTik
  const { data: disconnectCmds } = await supabaseAdmin
    .from("router_commands")
    .select("id, action, payload, status")
    .eq("tenant_id", tenant.id)
    .eq("action", "hotspot.delete_user")
    .ilike("payload->>username", voucherCode);

  if (!disconnectCmds || disconnectCmds.length === 0) {
    throw new Error("CRITICAL: Disconnect command was not enqueued upon session expiry!");
  }
  console.log(`[18] Verified MikroTik disconnect command enqueued:`, disconnectCmds[0]);

  // 13. Clean up test records
  console.log(`[19] Cleaning up test artifacts...`);
  await supabaseAdmin.from("router_commands").delete().ilike("payload->>username", voucherCode);
  await supabaseAdmin.from("customers").delete().eq("id", customer.id);
  await supabaseAdmin.from("vouchers").delete().eq("id", activation.voucher.id);
  await supabaseAdmin.from("transactions").delete().eq("id", txn.id);

  console.log("=== [E2E TEST] ALL CRITICAL WORKFLOWS PASSED IN REAL END-TO-END EXECUTION! ===");
}

runEndToEndLifecycle().catch((err) => {
  console.error("FATAL TEST FAILURE:", err);
  process.exit(1);
});
