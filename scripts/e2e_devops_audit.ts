import { supabaseAdmin } from "../src/integrations/supabase/client.server";
import { runBackgroundMaintenance } from "../src/lib/maintenance.server";
import { activateCustomerPackage } from "../src/lib/payments.functions";
import { enqueueRouterCommands } from "../src/lib/agent-commands.server";

interface TestResult {
  step: string;
  name: string;
  passed: boolean;
  details: string;
  error?: string;
}

const results: TestResult[] = [];

function logResult(step: string, name: string, passed: boolean, details: string, error?: string) {
  results.push({ step, name, passed, details, error });
  const icon = passed ? "✅ [PASS]" : "❌ [FAIL]";
  console.log(`${icon} [${step}] ${name}: ${details}`);
  if (error) {
    console.error(`       Error: ${error}`);
  }
}

async function runDevOpsAudit() {
  console.log("\n=======================================================");
  console.log("  Wi-Fi Billing System - Full DevOps End-to-End Audit  ");
  console.log("=======================================================\n");

  const BASE_URL = "http://localhost:3000";
  const TEST_ID = "audit_" + Date.now();
  let testTenantId = "";
  let testRouterId = "";
  const testRouterAgentKey = "audit_key_" + Math.random().toString(36).substring(2, 9);
  const testOnboardToken = "audit_token_" + Math.random().toString(36).substring(2, 9);
  let testPackageId = "";

  try {
    // -------------------------------------------------------------
    // STEP 1: Verify MikroTik API Connection
    // -------------------------------------------------------------
    console.log("--> STEP 1: Verifying MikroTik API Connection...");

    // 1.1 Find or create a test tenant
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from("tenants")
      .select("id, slug")
      .limit(1)
      .maybeSingle();

    if (tenantErr || !tenant) {
      throw new Error(`Failed to get active tenant: ${tenantErr?.message}`);
    }
    testTenantId = tenant.id;

    // 1.2 Create or find test router
    const { data: router, error: routerErr } = await supabaseAdmin
      .from("routers")
      .insert({
        tenant_id: testTenantId,
        name: `Audit Router ${TEST_ID}`,
        agent_key: testRouterAgentKey,
        onboard_token: testOnboardToken,
        status: "offline",
        desired_configuration_version: 1,
        configuration_version: 1,
      })
      .select("id")
      .single();

    if (routerErr || !router) {
      throw new Error(`Failed to create test router: ${routerErr?.message}`);
    }
    testRouterId = router.id;

    // 1.3 Test Onboarding Script Generation via HTTP
    const onboardRes = await fetch(`${BASE_URL}/api/public/mikrotik/onboard/${testOnboardToken}`);
    const onboardScript = await onboardRes.text();
    const hasSyncUsers =
      onboardScript.includes("syncusers") || onboardScript.includes("sync-users");
    const hasHeartbeat = onboardScript.includes("heartbeat");
    if (onboardRes.status === 200 && hasSyncUsers && hasHeartbeat) {
      logResult(
        "Step 1",
        "Router Onboarding Script Generation",
        true,
        "Fetched valid RouterOS onboarding script with sync and heartbeat schedulers",
      );
    } else {
      logResult(
        "Step 1",
        "Router Onboarding Script Generation",
        false,
        `Status: ${onboardRes.status}`,
        onboardScript.substring(0, 150),
      );
    }

    // 1.4 Test MikroTik Heartbeat API (GET & POST)
    const hbGetRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/heartbeat?token=${testOnboardToken}&cpu_load=15&free_mem=64000000&uptime=2d_04:12:00&hs=3&ppp=1`,
    );
    const hbGetData = await hbGetRes.json();

    const hbPostRes = await fetch(`${BASE_URL}/api/public/mikrotik/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Router-ID": testRouterId,
        "X-Agent-Key": testRouterAgentKey,
      },
      body: JSON.stringify({
        cpu_load: "25",
        free_memory: "55000000",
        uptime: "2d 04:15:00",
        active_hotspot_users: 5,
        active_pppoe_users: 2,
        ros_version: "7.15",
      }),
    });
    const hbPostData = await hbPostRes.json();

    // Verify DB was updated by Heartbeat
    const { data: updatedRouter } = await supabaseAdmin
      .from("routers")
      .select("status, online_status, active_hotspot_users, active_pppoe_users")
      .eq("id", testRouterId)
      .single();

    if (
      hbGetRes.status === 200 &&
      hbPostRes.status === 200 &&
      updatedRouter?.status === "online" &&
      updatedRouter?.active_hotspot_users === 5
    ) {
      logResult(
        "Step 1",
        "MikroTik Heartbeat Telemetry",
        true,
        "Router status online, telemetry recorded in database via GET & POST",
      );
    } else {
      logResult(
        "Step 1",
        "MikroTik Heartbeat Telemetry",
        false,
        `GET: ${hbGetRes.status}, POST: ${hbPostRes.status}, DB: ${JSON.stringify(updatedRouter)}`,
      );
    }

    // 1.5 Test MikroTik Command Sync Auth Validation
    const unauthSyncRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/sync?router_id=${testRouterId}&agent_key=invalid_key`,
    );
    const authSyncRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/sync?router_id=${testRouterId}&agent_key=${testRouterAgentKey}`,
    );
    const authSyncText = await authSyncRes.text();

    if (
      unauthSyncRes.status === 401 &&
      authSyncRes.status === 200 &&
      (authSyncText.includes("No pending commands") || authSyncText.includes("NO_COMMANDS"))
    ) {
      logResult(
        "Step 1",
        "MikroTik Sync Auth & Empty Poll",
        true,
        "Unauthorized rejected with 401, authorized returned 200 with No pending commands",
      );
    } else {
      logResult(
        "Step 1",
        "MikroTik Sync Auth & Empty Poll",
        false,
        `Unauth: ${unauthSyncRes.status}, Auth: ${authSyncRes.status}`,
      );
    }

    // -------------------------------------------------------------
    // STEP 2: Test API Requests
    // -------------------------------------------------------------
    console.log("\n--> STEP 2: Testing API Requests...");

    // 2.1 Test Portal Packages / Configuration
    const { data: testPkg, error: pkgErr } = await supabaseAdmin
      .from("packages")
      .insert({
        tenant_id: testTenantId,
        name: `Audit Turbo 1h ${TEST_ID}`,
        duration_hours: 1,
        price_kes: 20,
        speed_down_mbps: 10,
        speed_up_mbps: 5,
        device_limit: 1,
        kind: "hotspot",
        is_active: true,
      })
      .select()
      .single();

    if (pkgErr || !testPkg) {
      throw new Error(`Failed to create test package: ${pkgErr?.message}`);
    }
    testPackageId = testPkg.id;
    logResult(
      "Step 2",
      "Portal Package Creation",
      true,
      `Package ID ${testPackageId} created at KES 20 for 1h`,
    );

    // 2.2 Test M-Pesa Callback / IPN Endpoint
    const testReceipt = "MPESA" + Math.random().toString(36).substring(2, 9).toUpperCase();
    const testPhone = "254700" + Math.floor(100000 + Math.random() * 900000);
    const callbackPayload = {
      Body: {
        stkCallback: {
          MerchantRequestID: "MR_" + TEST_ID,
          CheckoutRequestID: "CR_" + TEST_ID,
          ResultCode: 0,
          ResultDesc: "The service request is processed successfully.",
          CallbackMetadata: {
            Item: [
              { Name: "Amount", Value: 20 },
              { Name: "MpesaReceiptNumber", Value: testReceipt },
              { Name: "TransactionDate", Value: 20260904120000 },
              { Name: "PhoneNumber", Value: Number(testPhone) },
            ],
          },
        },
      },
    };

    // Pre-insert transaction so callback finds it
    const { data: initTxn, error: initTxnErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        tenant_id: testTenantId,
        package_id: testPackageId,
        amount_kes: 20,
        phone: testPhone,
        kind: "customer_payment",
        status: "pending",
        checkout_request_id: "CR_" + TEST_ID,
        raw: {
          router_id: testRouterId,
          mac: "AA:BB:CC:DD:EE:FF",
        },
      })
      .select()
      .single();

    if (initTxnErr || !initTxn) {
      throw new Error(`Failed to insert test transaction: ${initTxnErr?.message}`);
    }

    const cbRes = await fetch(`${BASE_URL}/api/public/mpesa/callback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(callbackPayload),
    });
    const cbData = await cbRes.json();

    if (cbRes.status === 200 && cbData.ResultCode === 0) {
      logResult(
        "Step 2",
        "M-Pesa IPN / Callback Processing",
        true,
        `Callback accepted: ResultCode 0, receipt ${testReceipt}`,
      );
    } else {
      logResult(
        "Step 2",
        "M-Pesa IPN / Callback Processing",
        false,
        `Status: ${cbRes.status}`,
        JSON.stringify(cbData),
      );
    }

    // -------------------------------------------------------------
    // STEP 3: Confirm Post-Payment Commands
    // -------------------------------------------------------------
    console.log("\n--> STEP 3: Confirming Post-Payment Commands...");

    // 3.1 Verify transaction status was updated to success
    const { data: succTxn } = await supabaseAdmin
      .from("transactions")
      .select("status, voucher_id, customer_id, mpesa_receipt")
      .eq("id", initTxn.id)
      .single();

    const txnSuccess =
      succTxn?.status === "success" &&
      Boolean(succTxn?.voucher_id) &&
      succTxn?.mpesa_receipt === testReceipt;
    logResult(
      "Step 3",
      "Transaction State Transition",
      txnSuccess,
      `Status: ${succTxn?.status}, Voucher: ${succTxn?.voucher_id}, Receipt: ${succTxn?.mpesa_receipt}`,
    );

    // 3.2 Verify customer was provisioned
    const { data: createdCust } = await supabaseAdmin
      .from("customers")
      .select("id, status, expires_at, mac_address, router_id, username")
      .eq("id", succTxn.customer_id)
      .single();

    const custValid =
      createdCust?.status === "active" &&
      createdCust?.mac_address === "AA:BB:CC:DD:EE:FF" &&
      createdCust?.router_id === testRouterId;
    logResult(
      "Step 3",
      "Customer Record Provisioning",
      custValid,
      `Customer ${createdCust?.id} status: ${createdCust?.status}, MAC: ${createdCust?.mac_address}`,
    );

    // 3.3 Verify voucher record
    const { data: createdVoucher } = await supabaseAdmin
      .from("vouchers")
      .select("id, code, status, expires_at")
      .eq("id", succTxn.voucher_id)
      .single();

    const voucherValid = createdVoucher?.status === "active" && Boolean(createdVoucher?.code);
    logResult(
      "Step 3",
      "Voucher Record Provisioning",
      voucherValid,
      `Voucher code ${createdVoucher?.code}, status: ${createdVoucher?.status}`,
    );

    // 3.4 Verify Router Commands queued
    const { data: queuedCmds } = await supabaseAdmin
      .from("router_commands")
      .select("id, action, status, payload")
      .eq("router_id", testRouterId)
      .eq("status", "queued");

    const hasCreateUserCmd = queuedCmds?.some(
      (c) =>
        c.action === "hotspot.create_user" && (c.payload as any)?.username === createdVoucher?.code,
    );
    logResult(
      "Step 3",
      "Command Queue Insertion",
      Boolean(hasCreateUserCmd),
      `Found ${queuedCmds?.length || 0} queued commands, hotspot.create_user present: ${Boolean(hasCreateUserCmd)}`,
    );

    // 3.5 Fetch commands via Router Sync API (MikroTik Polling Simulation)
    const syncRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/sync?router_id=${testRouterId}&agent_key=${testRouterAgentKey}`,
    );
    const rscOutput = await syncRes.text();

    const hasUserAdd = rscOutput.includes(`/ip hotspot user add name="${createdVoucher?.code}"`);
    const hasRateLimit = rscOutput.includes(`rate-limit="5M/10M"`);
    const hasAutoLogin = rscOutput.includes(
      `/ip hotspot active login user="${createdVoucher?.code}"`,
    );
    const hasSuccessFooter = rscOutput.includes("Remote commands successfully executed");

    const routerScriptValid =
      syncRes.status === 200 && hasUserAdd && hasRateLimit && hasAutoLogin && hasSuccessFooter;
    logResult(
      "Step 3",
      "RouterOS Script Delivery & Content",
      routerScriptValid,
      `Contains user add: ${hasUserAdd}, rate-limit: ${hasRateLimit}, auto-login: ${hasAutoLogin}`,
    );

    // 3.6 Verify commands marked 'done'
    const { data: finishedCmds } = await supabaseAdmin
      .from("router_commands")
      .select("id, status, delivered_at")
      .eq("router_id", testRouterId)
      .in("id", queuedCmds?.map((c) => c.id) || []);

    const allDone = finishedCmds?.every((c) => c.status === "done" && Boolean(c.delivered_at));
    logResult(
      "Step 3",
      "Router Commands Completed",
      Boolean(allDone),
      `Delivered commands transitioned to status: 'done'`,
    );

    // -------------------------------------------------------------
    // STEP 4: Fix & Verify Automatic Session Expiry
    // -------------------------------------------------------------
    console.log("\n--> STEP 4: Verifying Automatic Session Expiry & Disconnect...");

    // 4.1 Set expiration of voucher and customer into the past to simulate expiry
    const pastTime = new Date(Date.now() - 3600 * 1000).toISOString();
    await supabaseAdmin
      .from("vouchers")
      .update({ expires_at: pastTime })
      .eq("id", createdVoucher.id);

    await supabaseAdmin.from("customers").update({ expires_at: pastTime }).eq("id", createdCust.id);

    // 4.2 Run background maintenance sweep (force = true)
    const maintResults = await runBackgroundMaintenance(true);
    const expiredCount =
      (maintResults?.vouchersExpired || 0) + (maintResults?.customersExpired || 0);
    logResult(
      "Step 4",
      "Maintenance Expiry Sweep",
      expiredCount >= 1,
      `Maintenance swept: vouchersExpired=${maintResults?.vouchersExpired}, customersExpired=${maintResults?.customersExpired}`,
    );

    // 4.3 Verify DB states updated to 'expired'
    const { data: expiredVoucherCheck } = await supabaseAdmin
      .from("vouchers")
      .select("status")
      .eq("id", createdVoucher.id)
      .single();

    const { data: expiredCustCheck } = await supabaseAdmin
      .from("customers")
      .select("status")
      .eq("id", createdCust.id)
      .single();

    const recordsExpired =
      expiredVoucherCheck?.status === "expired" && expiredCustCheck?.status === "expired";
    logResult(
      "Step 4",
      "Database State Transition to Expired",
      recordsExpired,
      `Voucher status: ${expiredVoucherCheck?.status}, Customer status: ${expiredCustCheck?.status}`,
    );

    // 4.4 Check that disconnect commands were queued in router_commands
    const { data: disconnectCmds } = await supabaseAdmin
      .from("router_commands")
      .select("id, action, status, payload")
      .eq("router_id", testRouterId)
      .eq("action", "hotspot.delete_user")
      .eq("status", "queued");

    const deleteCmdQueued = (disconnectCmds?.length || 0) > 0;
    logResult(
      "Step 4",
      "Disconnect Commands Queued",
      deleteCmdQueued,
      `Queued delete_user commands: ${disconnectCmds?.length}`,
    );

    // 4.5 Fetch router sync to deliver disconnect commands
    const disconnectSyncRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/sync?router_id=${testRouterId}&agent_key=${testRouterAgentKey}`,
    );
    const disconnectRsc = await disconnectSyncRes.text();

    const hasUserRemove = disconnectRsc.includes(
      `/ip hotspot user remove [find name="${createdVoucher?.code}"]`,
    );
    const hasActiveRemove = disconnectRsc.includes(
      `/ip hotspot active remove [find user="${createdVoucher?.code}"]`,
    );
    const hasCookieRemove = disconnectRsc.includes(
      `/ip hotspot cookie remove [find user="${createdVoucher?.code}"]`,
    );
    const hasMacBindingRemove = disconnectRsc.includes(
      `/ip hotspot ip-binding remove [find mac-address="AA:BB:CC:DD:EE:FF"]`,
    );
    const hasMacHostRemove = disconnectRsc.includes(
      `/ip hotspot host remove [find mac-address="AA:BB:CC:DD:EE:FF"]`,
    );
    const noNullMac = !disconnectRsc.includes(`mac-address="null"`);

    const expiryScriptValid =
      disconnectSyncRes.status === 200 &&
      hasUserRemove &&
      hasActiveRemove &&
      hasCookieRemove &&
      hasMacBindingRemove &&
      hasMacHostRemove &&
      noNullMac;

    logResult(
      "Step 4",
      "MikroTik Disconnect & Cookie Purge Script",
      expiryScriptValid,
      `User remove: ${hasUserRemove}, Active purge: ${hasActiveRemove}, Cookie remove: ${hasCookieRemove}, MAC binding remove: ${hasMacBindingRemove}, Host remove: ${hasMacHostRemove}, No null MAC query: ${noNullMac}`,
    );

    // -------------------------------------------------------------
    // STEP 5: Test Extended Real End-to-End Flows (MAC Bindings & PPPoE)
    // -------------------------------------------------------------
    console.log("\n--> STEP 5: Testing Extended End-to-End Flows (MAC Binding & PPPoE)...");

    // 5.1 Test Device MAC Bypassing (hotspot.bind_mac and hotspot.unbind_mac)
    const testMac = "11:22:33:44:55:66";
    await enqueueRouterCommands([
      {
        tenantId: testTenantId,
        routerId: testRouterId,
        action: "hotspot.bind_mac",
        payload: { mac: testMac, comment: "Audit TV Box" },
      },
    ]);

    const bindSyncRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/sync?router_id=${testRouterId}&agent_key=${testRouterAgentKey}`,
    );
    const bindRsc = await bindSyncRes.text();
    const hasBindingAdd = bindRsc.includes(
      `/ip hotspot ip-binding add mac-address="${testMac}" type=bypassed`,
    );
    logResult(
      "Step 5",
      "Device MAC Bypassed Binding",
      hasBindingAdd,
      `Generated bypass binding for MAC ${testMac}`,
    );

    await enqueueRouterCommands([
      {
        tenantId: testTenantId,
        routerId: testRouterId,
        action: "hotspot.unbind_mac",
        payload: { mac: testMac },
      },
    ]);

    const unbindSyncRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/sync?router_id=${testRouterId}&agent_key=${testRouterAgentKey}`,
    );
    const unbindRsc = await unbindSyncRes.text();
    const hasBindingRemove = unbindRsc.includes(
      `/ip hotspot ip-binding remove [find mac-address="${testMac}"]`,
    );
    logResult(
      "Step 5",
      "Device MAC Unbind & Host Purge",
      hasBindingRemove,
      `Generated removal of IP binding and active hosts for ${testMac}`,
    );

    // 5.2 Test PPPoE User Lifecycle (Create, Update, Disable, Delete)
    const pppUser = "audit_ppp_" + Math.random().toString(36).substring(2, 7);
    await enqueueRouterCommands([
      {
        tenantId: testTenantId,
        routerId: testRouterId,
        action: "pppoe.create_user",
        payload: { username: pppUser, password: "ppp_password123", profile: "10M_plan" },
      },
      {
        tenantId: testTenantId,
        routerId: testRouterId,
        action: "pppoe.update_user",
        payload: { username: pppUser, password: "new_password456", profile: "20M_plan" },
      },
      {
        tenantId: testTenantId,
        routerId: testRouterId,
        action: "pppoe.set_enabled",
        payload: { username: pppUser, enabled: false },
      },
      {
        tenantId: testTenantId,
        routerId: testRouterId,
        action: "pppoe.delete_user",
        payload: { username: pppUser },
      },
    ]);

    const pppSyncRes = await fetch(
      `${BASE_URL}/api/public/mikrotik/sync?router_id=${testRouterId}&agent_key=${testRouterAgentKey}`,
    );
    const pppRsc = await pppSyncRes.text();

    const hasPppAdd = pppRsc.includes(`/ppp secret add name="${pppUser}"`);
    const hasPppUpdate = pppRsc.includes(
      `/ppp secret set [find name="${pppUser}"] password="new_password456"`,
    );
    const hasPppDisable = pppRsc.includes(`/ppp secret set [find name="${pppUser}"] disabled=yes`);
    const hasPppActiveDrop = pppRsc.includes(`/ppp active remove [find name="${pppUser}"]`);
    const hasPppSecretRemove = pppRsc.includes(`/ppp secret remove [find name="${pppUser}"]`);

    const pppValid =
      hasPppAdd && hasPppUpdate && hasPppDisable && hasPppActiveDrop && hasPppSecretRemove;
    logResult(
      "Step 5",
      "PPPoE Full Lifecycle Sync",
      pppValid,
      `Create: ${hasPppAdd}, Update: ${hasPppUpdate}, Disable & Drop: ${hasPppDisable && hasPppActiveDrop}, Delete: ${hasPppSecretRemove}`,
    );
  } catch (err: any) {
    console.error("FATAL Audit Error:", err);
    logResult("General", "Audit Execution", false, err.message, err.stack);
  } finally {
    // Clean up test router and package
    if (testRouterId) {
      await supabaseAdmin.from("router_commands").delete().eq("router_id", testRouterId);
      await supabaseAdmin.from("router_heartbeats").delete().eq("router_id", testRouterId);
      await supabaseAdmin.from("router_sync_logs").delete().eq("router_id", testRouterId);
      await supabaseAdmin.from("routers").delete().eq("id", testRouterId);
    }
    if (testPackageId) {
      await supabaseAdmin.from("transactions").delete().eq("package_id", testPackageId);
      await supabaseAdmin.from("vouchers").delete().eq("package_id", testPackageId);
      await supabaseAdmin.from("customers").delete().eq("package_id", testPackageId);
      await supabaseAdmin.from("packages").delete().eq("id", testPackageId);
    }
  }

  // Final Summary
  console.log("\n=======================================================");
  console.log("                AUDIT RESULTS SUMMARY                  ");
  console.log("=======================================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`Total Checks: ${total} | Passed: ${passed} | Failed: ${failed}\n`);
  for (const r of results) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(`[${mark}] [${r.step}] ${r.name}`);
  }
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runDevOpsAudit();
