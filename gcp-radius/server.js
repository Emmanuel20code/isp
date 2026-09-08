import dgram from "node:dgram";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import radiusModule from "radius";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const radius = radiusModule.default || radiusModule;

// Load MikroTik dictionary
try {
  const dictPath = path.resolve(__dirname, "dictionary.mikrotik");
  radius.add_dictionary(dictPath);
  radius.load_dictionaries();
  console.log("[RadiusServer] MikroTik RADIUS dictionaries loaded successfully.");
} catch (err) {
  console.warn("[RadiusServer] Could not load dictionary:", err);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("ERROR: DATABASE_URL environment variable is required!");
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 20,
});

const AUTH_PORT = Number(process.env.RADIUS_AUTH_PORT || 1812);
const ACCT_PORT = Number(process.env.RADIUS_ACCT_PORT || 1813);
const DEFAULT_SECRET = process.env.RADIUS_SECRET || "emmatech_radius_secret_2026";

const authSocket = dgram.createSocket("udp4");
const acctSocket = dgram.createSocket("udp4");

async function resolveSecret(clientIp) {
  if (["127.0.0.1", "::1", "localhost"].includes(clientIp)) {
    return "testing123";
  }
  try {
    const res = await pool.query(
      `SELECT secret FROM nas WHERE nasname = $1 OR nasname = '0.0.0.0/0' ORDER BY (nasname != '0.0.0.0/0') DESC LIMIT 1`,
      [clientIp]
    );
    if (res.rows.length > 0 && res.rows[0].secret) {
      return res.rows[0].secret;
    }
  } catch {
    // fallback
  }
  return DEFAULT_SECRET;
}

// Auth Listener (UDP 1812)
authSocket.on("message", async (msg, rinfo) => {
  try {
    const secret = await resolveSecret(rinfo.address);
    let packet;
    try {
      packet = radius.decode({ packet: msg, secret });
    } catch (decErr) {
      if (secret !== DEFAULT_SECRET) {
        packet = radius.decode({ packet: msg, secret: DEFAULT_SECRET });
      } else {
        throw decErr;
      }
    }

    if (packet.code !== "Access-Request") return;

    const username = packet.attributes["User-Name"];
    const password = packet.attributes["User-Password"];
    const callingStationId = packet.attributes["Calling-Station-Id"] || null;
    const nasIp = rinfo.address;

    console.log(`[Radius] Auth Request: user="${username}", NAS=${nasIp}`);

    // Query customer in database
    const custRes = await pool.query(
      `SELECT c.id, c.username, c.password, c.status, c.expires_at, p.speed_down_mbps, p.speed_up_mbps, p.device_limit
       FROM customers c
       JOIN tenants t ON t.id = c.tenant_id
       LEFT JOIN packages p ON p.id = c.package_id
       WHERE c.username = $1 AND c.kind IN ('pppoe', 'hotspot')
       LIMIT 1`,
      [username]
    );

    let replyCode = "Access-Reject";
    let replyAttrs = [];
    let rejectReason = "User not found";

    if (custRes.rows.length === 0) {
      rejectReason = "User not found";
    } else {
      const cust = custRes.rows[0];
      const isExpired = cust.expires_at && new Date(cust.expires_at) < new Date();
      const isActive = cust.status === "active" && !isExpired;

      if (!isActive) {
        rejectReason = isExpired ? "Subscription expired" : "Account inactive";
      } else if (password && cust.password && password !== cust.password) {
        rejectReason = "Invalid password";
      } else {
        replyCode = "Access-Accept";
        rejectReason = "Authenticated successfully";

        // Build rate limits and session attributes
        const up = cust.speed_up_mbps || 10;
        const down = cust.speed_down_mbps || 20;
        const rateLimit = `${up}M/${down}M`;

        replyAttrs = [
          ["Framed-Protocol", "PPP"],
          ["Service-Type", "Framed-User"],
          ["Session-Timeout", 2592000],
          ["Vendor-Specific", [9, [1, rateLimit]]], // MikroTik-Rate-Limit
        ];
      }
    }

    // Log to radpostauth
    try {
      await pool.query(
        `INSERT INTO radpostauth (username, pass, reply, authdate, nasipaddress, callingstationid, reason)
         VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
        [username, password || "", replyCode, nasIp, callingStationId, rejectReason]
      );
    } catch {
      // ignore log error
    }

    const responsePacket = radius.encode({
      code: replyCode,
      secret,
      identifier: packet.identifier,
      code_authenticated: packet.code_authenticated,
      attributes: replyAttrs,
    });

    authSocket.send(responsePacket, rinfo.port, rinfo.address);
    console.log(`[Radius] ${replyCode} sent for "${username}" (Reason: ${rejectReason})`);
  } catch (err) {
    console.error("[Radius] Auth handling error:", err);
  }
});

// Accounting Listener (UDP 1813)
acctSocket.on("message", async (msg, rinfo) => {
  try {
    const secret = await resolveSecret(rinfo.address);
    let packet;
    try {
      packet = radius.decode({ packet: msg, secret });
    } catch {
      return;
    }

    if (packet.code !== "Accounting-Request") return;

    const username = packet.attributes["User-Name"];
    const statusType = packet.attributes["Acct-Status-Type"];
    const sessionId = packet.attributes["Acct-Session-Id"];
    const framedIp = packet.attributes["Framed-IP-Address"] || null;
    const callingStationId = packet.attributes["Calling-Station-Id"] || null;
    const inputOctets = packet.attributes["Acct-Input-Octets"] || 0;
    const outputOctets = packet.attributes["Acct-Output-Octets"] || 0;
    const sessionTime = packet.attributes["Acct-Session-Time"] || 0;
    const terminateCause = packet.attributes["Acct-Terminate-Cause"] || null;

    if (statusType === "Start") {
      await pool.query(
        `INSERT INTO radacct (acctsessionid, username, nasipaddress, framedipaddress, callingstationid, acctstarttime, acctsessiontime, acctinputoctets, acctoutputoctets, acctstatus_type)
         VALUES ($1, $2, $3, $4, $5, NOW(), $6, $7, $8, $9)
         ON CONFLICT (acctsessionid) DO NOTHING`,
        [sessionId, username, rinfo.address, framedIp, callingStationId, sessionTime, inputOctets, outputOctets, "Start"]
      );
    } else if (statusType === "Interim-Update") {
      await pool.query(
        `UPDATE radacct
         SET acctsessiontime = $1, acctinputoctets = $2, acctoutputoctets = $3, framedipaddress = COALESCE($4, framedipaddress)
         WHERE acctsessionid = $5`,
        [sessionTime, inputOctets, outputOctets, framedIp, sessionId]
      );
    } else if (statusType === "Stop") {
      await pool.query(
        `UPDATE radacct
         SET acctstoptime = NOW(), acctsessiontime = $1, acctinputoctets = $2, acctoutputoctets = $3, acctterminatecause = $4
         WHERE acctsessionid = $5`,
        [sessionTime, inputOctets, outputOctets, terminateCause, sessionId]
      );
    }

    const responsePacket = radius.encode({
      code: "Accounting-Response",
      secret,
      identifier: packet.identifier,
      code_authenticated: packet.code_authenticated,
      attributes: [],
    });

    acctSocket.send(responsePacket, rinfo.port, rinfo.address);
  } catch (err) {
    console.error("[Radius] Acct error:", err);
  }
});

authSocket.bind(AUTH_PORT, "0.0.0.0", () => {
  console.log(`[GCP Radius] Authentication server listening on UDP 0.0.0.0:${AUTH_PORT}`);
});

acctSocket.bind(ACCT_PORT, "0.0.0.0", () => {
  console.log(`[GCP Radius] Accounting server listening on UDP 0.0.0.0:${ACCT_PORT}`);
});
