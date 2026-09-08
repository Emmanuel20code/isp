import { Pool } from "pg";
import {
  startRadiusServer,
  stopRadiusServer,
  testRadiusAuth,
  isRadiusServerRunning,
} from "./src/lib/radius-server.server";
// @ts-expect-error - radius lacks ts declarations
import radiusModule from "radius";
import dgram from "dgram";

const radius = radiusModule.default || radiusModule;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

async function runE2ETest() {
  console.log("=== STARTING E2E PPPOE + FREERADIUS INTEGRATION TEST ===");

  // 1. Ensure RADIUS server is running
  if (!isRadiusServerRunning()) {
    console.log("1. Starting RADIUS server on UDP 1812 & 1813...");
    await startRadiusServer();
  } else {
    console.log("1. RADIUS server is already running on UDP 1812 & 1813.");
  }

  // 2. Locate or create a test tenant and package
  const tenantRes = await query(`SELECT id FROM tenants LIMIT 1`);
  const tenantId = tenantRes.rows[0]?.id;
  if (!tenantId) {
    throw new Error("No tenant found in database");
  }
  console.log(`2. Using Tenant ID: ${tenantId}`);

  // Find or create a test PPPoE package
  let pkgRes = await query(`SELECT id, name, speed_down_mbps, speed_up_mbps FROM packages WHERE tenant_id = $1 AND kind = 'pppoe' LIMIT 1`, [tenantId]);
  let pkg = pkgRes.rows[0];
  if (!pkg) {
    const newPkg = await query(
      `INSERT INTO packages (tenant_id, name, kind, price_kes, speed_down_mbps, speed_up_mbps, duration_hours)
       VALUES ($1, 'Fiber Home 15M', 'pppoe', 2500, 15, 10, 720) RETURNING id, name, speed_down_mbps, speed_up_mbps`,
      [tenantId]
    );
    pkg = newPkg.rows[0];
  }
  console.log(`3. Using PPPoE Package: ${pkg.name} (${pkg.speed_up_mbps}M up / ${pkg.speed_down_mbps}M down)`);

  const testUsername = "e2e_subscriber_" + Date.now();
  const testPassword = "SecretPassword123!";

  // 4. Create customer in database
  console.log(`4. Creating subscriber '${testUsername}' with active subscription...`);
  const custRes = await query(
    `INSERT INTO customers (tenant_id, username, password, full_name, phone, kind, status, package_id, expires_at)
     VALUES ($1, $2, $3, 'E2E Test Customer', '0700112233', 'pppoe', 'active', $4, NOW() + interval '30 days')
     RETURNING id, username, status, expires_at`,
    [tenantId, testUsername, testPassword, pkg.id]
  );
  const cust = custRes.rows[0];
  console.log(`   Subscriber created (ID: ${cust.id}, status: ${cust.status}, expires: ${cust.expires_at})`);

  // 5. Verify PostgreSQL trigger populated radcheck & radreply
  const radcheckRes = await query(`SELECT * FROM radcheck WHERE username = $1`, [testUsername]);
  const radreplyRes = await query(`SELECT * FROM radreply WHERE username = $1`, [testUsername]);
  console.log(`5. Trigger verification:`);
  console.log(`   radcheck rows: ${radcheckRes.rows.length} (attribute: ${radcheckRes.rows[0]?.attribute}, value: ${radcheckRes.rows[0]?.value})`);
  console.log(`   radreply rows: ${radreplyRes.rows.length} (Mikrotik-Rate-Limit: ${radreplyRes.rows.find(r => r.attribute === 'Mikrotik-Rate-Limit')?.value})`);

  // 6. Test RADIUS Access-Request (Authentication)
  console.log(`6. Testing RADIUS Authentication (UDP 1812)...`);
  const authRes = await testRadiusAuth({
    host: "127.0.0.1",
    username: testUsername,
    password: testPassword,
    secret: "testing123",
  });
  console.log(`   Result: ${authRes.code} in ${authRes.latencyMs}ms`);
  console.log(`   Attributes:`, authRes.attributes);
  if (!authRes.success || authRes.code !== "Access-Accept") {
    throw new Error(`Authentication test failed: expected Access-Accept, got ${authRes.code}`);
  }
  const rateLimit =
    authRes.attributes["Mikrotik-Rate-Limit"] ||
    authRes.attributes["Vendor-Specific"]?.["Mikrotik-Rate-Limit"];
  if (!rateLimit) {
    throw new Error("Missing Mikrotik-Rate-Limit in RADIUS response!");
  }
  console.log(`   ✓ Access-Accept verified with Rate-Limit: ${rateLimit}`);

  // 7. Verify radpostauth audit table
  const postAuthRes = await query(
    `SELECT * FROM radpostauth WHERE username = $1 ORDER BY authdate DESC LIMIT 1`,
    [testUsername]
  );
  console.log(`7. Verifying radpostauth log: reply=${postAuthRes.rows[0]?.reply}, date=${postAuthRes.rows[0]?.authdate}`);
  if (postAuthRes.rows[0]?.reply !== "Access-Accept") {
    throw new Error("radpostauth does not record Access-Accept!");
  }

  // 8. Test RADIUS Accounting (UDP 1813): Start session
  console.log(`8. Testing RADIUS Accounting Start (UDP 1813)...`);
  const sessionId = "sess_" + Date.now();
  const framedIp = "10.100.0.45";
  const macAddr = "48:A9:D2:11:22:33";

  await sendRadiusAcct({
    statusType: "Start",
    username: testUsername,
    sessionId,
    framedIp,
    macAddr,
  });
  
  // Verify radacct has active session
  let acctRes = await query(
    `SELECT * FROM radacct WHERE username = $1 AND acctsessionid = $2`,
    [testUsername, sessionId]
  );
  console.log(`   radacct Start verified: radacctid=${acctRes.rows[0]?.radacctid}, framedip=${acctRes.rows[0]?.framedipaddress}`);
  if (!acctRes.rows[0] || acctRes.rows[0].acctstoptime !== null) {
    throw new Error("radacct Start record not created or already stopped");
  }

  // 9. Test RADIUS Accounting Interim-Update (15MB in, 45MB out)
  console.log(`9. Testing RADIUS Accounting Interim-Update (traffic)...`);
  await sendRadiusAcct({
    statusType: "Interim-Update",
    username: testUsername,
    sessionId,
    framedIp,
    macAddr,
    inputOctets: 15 * 1024 * 1024,
    outputOctets: 45 * 1024 * 1024,
    sessionTime: 300,
  });

  acctRes = await query(
    `SELECT acctinputoctets, acctoutputoctets, acctsessiontime FROM radacct WHERE username = $1 AND acctsessionid = $2`,
    [testUsername, sessionId]
  );
  console.log(`   radacct Update verified: in=${acctRes.rows[0]?.acctinputoctets}, out=${acctRes.rows[0]?.acctoutputoctets}, time=${acctRes.rows[0]?.acctsessiontime}s`);

  // 10. Test RADIUS Accounting Stop
  console.log(`10. Testing RADIUS Accounting Stop...`);
  await sendRadiusAcct({
    statusType: "Stop",
    username: testUsername,
    sessionId,
    framedIp,
    macAddr,
    inputOctets: 20 * 1024 * 1024,
    outputOctets: 60 * 1024 * 1024,
    sessionTime: 600,
    terminateCause: "User-Request",
  });

  acctRes = await query(
    `SELECT acctstoptime, acctterminatecause FROM radacct WHERE username = $1 AND acctsessionid = $2`,
    [testUsername, sessionId]
  );
  console.log(`   radacct Stop verified: stoptime=${acctRes.rows[0]?.acctstoptime}, cause=${acctRes.rows[0]?.acctterminatecause}`);
  if (!acctRes.rows[0]?.acctstoptime) {
    throw new Error("radacct Stop record did not record stoptime!");
  }

  // 11. Test Subscription Expiration (Reject)
  console.log(`11. Simulating subscription expiration...`);
  await query(`UPDATE customers SET expires_at = NOW() - interval '2 hours' WHERE id = $1`, [cust.id]);
  
  const expiredAuth = await testRadiusAuth({
    host: "127.0.0.1",
    username: testUsername,
    password: testPassword,
    secret: "testing123",
  });
  console.log(`   Result for expired user: ${expiredAuth.code} (Reason: ${expiredAuth.error})`);
  if (expiredAuth.code !== "Access-Reject") {
    throw new Error(`Expected Access-Reject for expired user, got ${expiredAuth.code}`);
  }
  console.log(`   ✓ Expired user successfully rejected by RADIUS!`);

  // 12. Test Renewal (Accept restored)
  console.log(`12. Simulating M-Pesa renewal (extending 30 days)...`);
  await query(
    `UPDATE customers SET expires_at = NOW() + interval '30 days', status = 'active' WHERE id = $1`,
    [cust.id]
  );

  const renewedAuth = await testRadiusAuth({
    host: "127.0.0.1",
    username: testUsername,
    password: testPassword,
    secret: "testing123",
  });
  console.log(`   Result after renewal: ${renewedAuth.code} in ${renewedAuth.latencyMs}ms`);
  if (renewedAuth.code !== "Access-Accept") {
    throw new Error(`Expected Access-Accept after renewal, got ${renewedAuth.code}`);
  }
  console.log(`   ✓ Renewed user instantly re-accepted by RADIUS!`);

  // Cleanup test customer
  console.log(`13. Cleaning up test subscriber records...`);
  await query(`DELETE FROM customers WHERE id = $1`, [cust.id]);
  await query(`DELETE FROM radacct WHERE username = $1`, [testUsername]);
  await query(`DELETE FROM radpostauth WHERE username = $1`, [testUsername]);

  // 14. Test Hotspot Customer / Voucher RADIUS Authentication
  console.log(`14. Testing Hotspot Customer / Voucher RADIUS Authentication...`);
  const hotspotUser = "hs_voucher_" + Date.now();
  const hotspotPass = "voucher123";
  const hsCustRes = await query(
    `INSERT INTO customers (tenant_id, username, password, full_name, phone, kind, status, package_id, expires_at)
     VALUES ($1, $2, $3, 'Hotspot Voucher User', '0711223344', 'hotspot', 'active', $4, NOW() + interval '1 day')
     RETURNING id, username, status`,
    [tenantId, hotspotUser, hotspotPass, pkg.id]
  );
  const hsCust = hsCustRes.rows[0];

  const hsAuthRes = await testRadiusAuth({
    host: "127.0.0.1",
    username: hotspotUser,
    password: hotspotPass,
    secret: "testing123",
  });
  console.log(`   Hotspot Auth Result: ${hsAuthRes.code} in ${hsAuthRes.latencyMs}ms`);
  if (hsAuthRes.code !== "Access-Accept") {
    throw new Error(`Expected Access-Accept for hotspot voucher, got ${hsAuthRes.code}`);
  }
  console.log(`   ✓ Hotspot Voucher successfully authenticated via RADIUS!`);

  await query(`DELETE FROM customers WHERE id = $1`, [hsCust.id]);
  await query(`DELETE FROM radpostauth WHERE username = $1`, [hotspotUser]);

  console.log("\n=======================================================");
  console.log("🎉 ALL E2E PPPOE + HOTSPOT + FREERADIUS TESTS PASSED!");
  console.log("=======================================================\n");

  process.exit(0);
}

function sendRadiusAcct(opts: {
  statusType: "Start" | "Stop" | "Interim-Update";
  username: string;
  sessionId: string;
  framedIp: string;
  macAddr: string;
  inputOctets?: number;
  outputOctets?: number;
  sessionTime?: number;
  terminateCause?: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = dgram.createSocket("udp4");
    const attributes: any[] = [
      ["User-Name", opts.username],
      ["Acct-Status-Type", opts.statusType],
      ["Acct-Session-Id", opts.sessionId],
      ["Framed-IP-Address", opts.framedIp],
      ["Calling-Station-Id", opts.macAddr],
      ["NAS-IP-Address", "127.0.0.1"],
      ["NAS-Identifier", "MikroTik-Test-Router"],
    ];

    if (opts.inputOctets !== undefined) {
      attributes.push(["Acct-Input-Octets", opts.inputOctets]);
    }
    if (opts.outputOctets !== undefined) {
      attributes.push(["Acct-Output-Octets", opts.outputOctets]);
    }
    if (opts.sessionTime !== undefined) {
      attributes.push(["Acct-Session-Time", opts.sessionTime]);
    }
    if (opts.terminateCause) {
      attributes.push(["Acct-Terminate-Cause", opts.terminateCause]);
    }

    const packet = radius.encode({
      code: "Accounting-Request",
      secret: "testing123",
      identifier: Math.floor(Math.random() * 255),
      attributes,
    });

    client.on("message", (msg) => {
      const decoded = radius.decode({ packet: msg, secret: "testing123" });
      client.close();
      if (decoded.code === "Accounting-Response") {
        resolve();
      } else {
        reject(new Error(`Unexpected accounting response: ${decoded.code}`));
      }
    });

    client.on("error", (err) => {
      client.close();
      reject(err);
    });

    client.send(packet, 0, packet.length, 1813, "127.0.0.1");
  });
}

runE2ETest().catch((err) => {
  console.error("E2E Test Failed:", err);
  process.exit(1);
});
