import dgram from "node:dgram";
import path from "node:path";
import { Pool } from "pg";
// @ts-expect-error - radius is a CJS module without type declarations
import radiusModule from "radius";
import { logAuthQueryDetails } from "./auth-logger";

const radius = radiusModule.default || radiusModule;

let isDictionariesLoaded = false;

export function ensureRadiusDictionaries(): void {
  if (isDictionariesLoaded) return;
  try {
    const dictPath = path.resolve(process.cwd(), "radius", "dictionary.mikrotik");
    radius.unload_dictionaries();
    radius.add_dictionary(dictPath);
    radius.load_dictionaries();
    isDictionariesLoaded = true;
    console.log("[RadiusServer] MikroTik RADIUS dictionaries loaded successfully.");
  } catch (err) {
    console.warn("[RadiusServer] Could not load custom dictionary, using defaults:", err);
  }
}

let poolInstance: Pool | null = null;
function getPgPool(): Pool {
  if (!poolInstance) {
    const connStr = process.env.DATABASE_URL || "";
    const isLocal =
      connStr.includes("localhost") ||
      connStr.includes("127.0.0.1") ||
      connStr.includes("@postgres:") ||
      connStr.includes("sslmode=disable");

    poolInstance = new Pool({
      connectionString: connStr,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
    });
  }
  return poolInstance;
}

interface ActiveRadiusServer {
  authSocket: dgram.Socket;
  acctSocket: dgram.Socket;
  authPort: number;
  acctPort: number;
}

let activeServer: ActiveRadiusServer | null = null;

export async function startRadiusServer(options?: {
  authPort?: number;
  acctPort?: number;
  defaultSecret?: string;
}): Promise<ActiveRadiusServer> {
  if (activeServer) {
    return activeServer;
  }

  ensureRadiusDictionaries();
  const pool = getPgPool();

  const authPort = options?.authPort ?? Number(process.env.RADIUS_AUTH_PORT || 1812);
  const acctPort = options?.acctPort ?? Number(process.env.RADIUS_ACCT_PORT || 1813);
  const defaultSecret = options?.defaultSecret || process.env.RADIUS_SECRET || "emmatech_radius_secret_2026";

  const authSocket = dgram.createSocket("udp4");
  const acctSocket = dgram.createSocket("udp4");

  // Helper to find router secret by IP
  async function resolveSecret(clientIp: string): Promise<string> {
    if (clientIp === "127.0.0.1" || clientIp === "::1" || clientIp === "localhost") {
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
      // ignore
    }
    return defaultSecret;
  }

  // Handle Authentication (UDP 1812)
  authSocket.on("message", async (msg, rinfo) => {
    try {
      const secret = await resolveSecret(rinfo.address);
      let packet: any;
      try {
        packet = radius.decode({ packet: msg, secret });
      } catch (decErr) {
        // Retry with default secret if client secret didn't match
        if (secret !== defaultSecret) {
          packet = radius.decode({ packet: msg, secret: defaultSecret });
        } else {
          throw decErr;
        }
      }

      if (packet.code !== "Access-Request") return;

      const username = packet.attributes["User-Name"];
      const password = packet.attributes["User-Password"];
      const nasIp = packet.attributes["NAS-IP-Address"] || rinfo.address;
      const callingStation = packet.attributes["Calling-Station-Id"] || "";

      console.log(`[RadiusServer] Auth Request for user: "${username}" from NAS ${nasIp} (${rinfo.address})`);

      // Special healthcheck user
      if (username === "healthcheck" || username === "test-ping") {
        const accept = radius.encode_response({
          packet,
          code: "Access-Accept",
          secret,
          attributes: [
            ["Reply-Message", "EMMATECH RADIUS is healthy"],
            ["Framed-Protocol", "PPP"],
          ],
        });
        authSocket.send(accept, rinfo.port, rinfo.address);
        return;
      }

      const callingProtocol = packet.attributes["Framed-Protocol"] || "";
      const isPppRequest = callingProtocol === "PPP" || callingProtocol === 1;

      const sqlQuery = `SELECT attribute, op, value FROM radcheck WHERE username = $1 ORDER BY id`;
      const queryParams = [username];

      // 1. Query radcheck rules for user
      const checkRes = await pool.query(sqlQuery, queryParams);

      let isAllowed = true;
      let rejectReason = "";

      if (checkRes.rows.length === 0) {
        isAllowed = false;
        rejectReason = "User credentials not found";
      } else {
        for (const row of checkRes.rows) {
          const { attribute, op, value } = row;

          if (attribute === "Auth-Type" && value === "Reject") {
            isAllowed = false;
            rejectReason = "Account suspended or expired";
            break;
          }

          if (attribute === "Cleartext-Password") {
            if (password && value !== password) {
              isAllowed = false;
              rejectReason = "Password mismatch";
              break;
            }
          }

          if (attribute === "Framed-Protocol") {
            if (op === "==" && value === "PPP" && !isPppRequest) {
              isAllowed = false;
              rejectReason = "PPPoE credentials cannot be used for Hotspot";
              break;
            }
            if (op === "!=" && value === "PPP" && isPppRequest) {
              isAllowed = false;
              rejectReason = "Hotspot voucher cannot be used for PPPoE";
              break;
            }
          }

          if (attribute === "Calling-Station-Id") {
            if (op === "=~") {
              try {
                let cleanVal = value;
                if (cleanVal.startsWith("(?i)")) {
                  cleanVal = cleanVal.substring(4);
                }
                const regex = new RegExp(cleanVal, "i");
                if (!regex.test(callingStation)) {
                  isAllowed = false;
                  rejectReason = `MAC mismatch: ${callingStation} not authorized for this package`;
                  break;
                }
              } catch (err: any) {
                console.warn("[RadiusServer] Regex match failed fallback to direct match:", err.message);
                if (callingStation.toUpperCase() !== value.toUpperCase()) {
                  isAllowed = false;
                  rejectReason = `MAC mismatch: ${callingStation}`;
                  break;
                }
              }
            } else if (op === "==" || op === ":=") {
              if (callingStation.toUpperCase() !== value.toUpperCase()) {
                isAllowed = false;
                rejectReason = `MAC mismatch: ${callingStation}`;
                break;
              }
            }
          }
        }
      }

      // Log exact SQL query, input parameters vs database schema, and result
      try {
        logAuthQueryDetails({
          authType: isPppRequest ? "pppoe_username" : "hotspot_mac",
          username,
          password,
          callingStation,
          nasIp,
          callingProtocol,
          isPppRequest,
          sqlQuery,
          queryParams,
          returnedRows: checkRes.rows,
          isAllowed,
          rejectReason,
        });
      } catch (logErr) {
        console.warn("[RadiusServer] Auth query logger error:", logErr);
      }

      // 2. Fetch radreply attributes if allowed
      const replyAttributes: any[] = [];
      let rateLimit = "5M/10M";
      let sessionTimeout = 86400;

      if (isAllowed) {
        const replyRes = await pool.query(
          `SELECT attribute, value FROM radreply WHERE username = $1 ORDER BY id`,
          [username]
        );

        for (const row of replyRes.rows) {
          if (row.attribute === "Framed-Protocol") {
            replyAttributes.push(["Framed-Protocol", row.value]);
          } else if (row.attribute === "Service-Type") {
            replyAttributes.push(["Service-Type", row.value]);
          } else if (row.attribute === "Session-Timeout") {
            sessionTimeout = parseInt(row.value, 10) || 86400;
            replyAttributes.push(["Session-Timeout", sessionTimeout]);
          } else if (row.attribute === "Mikrotik-Rate-Limit") {
            rateLimit = row.value;
            replyAttributes.push(["Vendor-Specific", 14988, [["Mikrotik-Rate-Limit", rateLimit]]]);
          }
        }
      }

      // Record in radpostauth
      try {
        await pool.query(
          `INSERT INTO radpostauth (username, pass, reply, authdate, nasipaddress, callingstationid, reason)
           VALUES ($1, $2, $3, NOW(), $4, $5, $6)`,
          [
            username,
            isAllowed ? "******" : password || "******",
            isAllowed ? "Access-Accept" : "Access-Reject",
            nasIp,
            callingStation,
            isAllowed ? "Authorized" : rejectReason,
          ]
        );
      } catch (logErr) {
        console.warn("[RadiusServer] Failed to insert radpostauth:", logErr);
      }

      if (isAllowed) {
        const responsePacket = radius.encode_response({
          packet,
          code: "Access-Accept",
          secret,
          attributes: replyAttributes,
        });

        authSocket.send(responsePacket, rinfo.port, rinfo.address);
        console.log(`[RadiusServer] Access-Accept sent for "${username}" (Rate: ${rateLimit}, Timeout: ${sessionTimeout}s)`);
      } else {
        const responsePacket = radius.encode_response({
          packet,
          code: "Access-Reject",
          secret,
          attributes: [
            ["Reply-Message", rejectReason || "Authentication Failed"],
          ],
        });

        authSocket.send(responsePacket, rinfo.port, rinfo.address);
        console.log(`[RadiusServer] Access-Reject sent for "${username}": ${rejectReason}`);
      }
    } catch (err) {
      console.error("[RadiusServer] Error handling auth packet:", err);
    }
  });

  // Handle Accounting (UDP 1813)
  acctSocket.on("message", async (msg, rinfo) => {
    try {
      const secret = await resolveSecret(rinfo.address);
      const packet = radius.decode({ packet: msg, secret });

      if (packet.code !== "Accounting-Request") return;

      const statusType = packet.attributes["Acct-Status-Type"]; // 'Start', 'Stop', 'Interim-Update'
      const username = packet.attributes["User-Name"];
      const sessionId = packet.attributes["Acct-Session-Id"] || `${username}-${Date.now()}`;
      const uniqueId = `${sessionId}-${packet.attributes["NAS-IP-Address"] || rinfo.address}`;
      const nasIp = packet.attributes["NAS-IP-Address"] || rinfo.address;
      const framedIp = packet.attributes["Framed-IP-Address"] || null;
      const callingStation = packet.attributes["Calling-Station-Id"] || null;
      const inOctets = Number(packet.attributes["Acct-Input-Octets"] || 0);
      const outOctets = Number(packet.attributes["Acct-Output-Octets"] || 0);
      const sessionTime = Number(packet.attributes["Acct-Session-Time"] || 0);
      const terminateCause = packet.attributes["Acct-Terminate-Cause"] || "";

      console.log(`[RadiusServer] Acct ${statusType} for "${username}" (Session: ${sessionId}, IP: ${framedIp})`);

      if (statusType === "Start") {
        await pool.query(
          `INSERT INTO radacct (
             acctsessionid, acctuniqueid, username, nasipaddress,
             acctstarttime, acctupdatetime, acctsessiontime,
             acctinputoctets, acctoutputoctets, callingstationid,
             servicetype, framedprotocol, framedipaddress
           ) VALUES ($1, $2, $3, $4, NOW(), NOW(), 0, 0, 0, $5, 'Framed-User', 'PPP', $6)
           ON CONFLICT (acctuniqueid) DO UPDATE SET
             acctupdatetime = NOW(),
             framedipaddress = EXCLUDED.framedipaddress`,
          [sessionId, uniqueId, username, nasIp, callingStation, framedIp]
        );
      } else if (statusType === "Interim-Update") {
        await pool.query(
          `UPDATE radacct SET
             acctupdatetime = NOW(),
             acctsessiontime = $1,
             acctinputoctets = $2,
             acctoutputoctets = $3,
             framedipaddress = COALESCE($4, framedipaddress)
           WHERE acctsessionid = $5`,
          [sessionTime, inOctets, outOctets, framedIp, sessionId]
        );
      } else if (statusType === "Stop") {
        await pool.query(
          `UPDATE radacct SET
             acctstoptime = NOW(),
             acctupdatetime = NOW(),
             acctsessiontime = $1,
             acctinputoctets = $2,
             acctoutputoctets = $3,
             acctterminatecause = $4
           WHERE acctsessionid = $5`,
          [sessionTime, inOctets, outOctets, terminateCause, sessionId]
        );
      }

      // Always send Accounting-Response
      const resp = radius.encode_response({
        packet,
        code: "Accounting-Response",
        secret,
      });
      acctSocket.send(resp, rinfo.port, rinfo.address);
    } catch (err) {
      console.error("[RadiusServer] Error handling acct packet:", err);
    }
  });

  await new Promise<void>((resolve, reject) => {
    let boundCount = 0;
    authSocket.bind(authPort, "0.0.0.0", () => {
      console.log(`[RadiusServer] Authentication listener active on UDP 0.0.0.0:${authPort}`);
      boundCount++;
      if (boundCount === 2) resolve();
    });
    acctSocket.bind(acctPort, "0.0.0.0", () => {
      console.log(`[RadiusServer] Accounting listener active on UDP 0.0.0.0:${acctPort}`);
      boundCount++;
      if (boundCount === 2) resolve();
    });
    authSocket.on("error", (err) => {
      console.error("[RadiusServer] Auth socket error:", err);
      reject(err);
    });
    acctSocket.on("error", (err) => {
      console.error("[RadiusServer] Acct socket error:", err);
      reject(err);
    });
  });

  activeServer = {
    authSocket,
    acctSocket,
    authPort,
    acctPort,
  };

  return activeServer;
}

export function isRadiusServerRunning(): boolean {
  return activeServer !== null;
}

export async function stopRadiusServer(): Promise<void> {
  if (!activeServer) return;
  const { authSocket, acctSocket } = activeServer;
  await new Promise<void>((res) => authSocket.close(() => res()));
  await new Promise<void>((res) => acctSocket.close(() => res()));
  activeServer = null;
  console.log("[RadiusServer] RADIUS listeners stopped.");
}

export interface RadiusAuthTestResult {
  success: boolean;
  code: string;
  attributes?: Record<string, unknown>;
  latencyMs: number;
  error?: string;
}

export async function testRadiusAuth(params: {
  host?: string;
  port?: number;
  secret?: string;
  username: string;
  password?: string;
  timeoutMs?: number;
}): Promise<RadiusAuthTestResult> {
  ensureRadiusDictionaries();
  const host = params.host || "127.0.0.1";
  const port = params.port || Number(process.env.RADIUS_AUTH_PORT || 1812);
  const secret = params.secret || (host === "127.0.0.1" ? "testing123" : process.env.RADIUS_SECRET || "emmatech_radius_secret_2026");
  const timeoutMs = params.timeoutMs || 3000;

  const client = dgram.createSocket("udp4");
  const startTime = Date.now();

  return new Promise<RadiusAuthTestResult>((resolve) => {
    let timer: NodeJS.Timeout;

    client.on("message", (msg) => {
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      try {
        const decoded = radius.decode({ packet: msg, secret });
        client.close();
        resolve({
          success: decoded.code === "Access-Accept",
          code: decoded.code,
          attributes: decoded.attributes,
          latencyMs,
        });
      } catch (decErr: any) {
        client.close();
        resolve({
          success: false,
          code: "DecodeError",
          latencyMs,
          error: decErr.message || "Failed to decode RADIUS response",
        });
      }
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      client.close();
      resolve({
        success: false,
        code: "SocketError",
        latencyMs: Date.now() - startTime,
        error: err.message,
      });
    });

    const packet = radius.encode({
      code: "Access-Request",
      secret,
      identifier: Math.floor(Math.random() * 255),
      attributes: [
        ["User-Name", params.username],
        ["User-Password", params.password || "test"],
        ["NAS-IP-Address", "127.0.0.1"],
      ],
    });

    client.send(packet, port, host, (sendErr) => {
      if (sendErr) {
        clearTimeout(timer);
        client.close();
        resolve({
          success: false,
          code: "SendError",
          latencyMs: Date.now() - startTime,
          error: sendErr.message,
        });
      }
    });

    timer = setTimeout(() => {
      client.close();
      resolve({
        success: false,
        code: "Timeout",
        latencyMs: Date.now() - startTime,
        error: `RADIUS server did not respond within ${timeoutMs}ms`,
      });
    }, timeoutMs);
  });
}

export async function testRadiusAccounting(params: {
  host?: string;
  port?: number;
  secret?: string;
  username: string;
  sessionId: string;
  statusType: "Start" | "Stop" | "Interim-Update";
  framedIp?: string;
  inputOctets?: number;
  outputOctets?: number;
  sessionTime?: number;
}): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  ensureRadiusDictionaries();
  const host = params.host || "127.0.0.1";
  const port = params.port || Number(process.env.RADIUS_ACCT_PORT || 1813);
  const secret = params.secret || (host === "127.0.0.1" ? "testing123" : process.env.RADIUS_SECRET || "emmatech_radius_secret_2026");

  const client = dgram.createSocket("udp4");
  const startTime = Date.now();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      client.close();
      resolve({ success: false, latencyMs: Date.now() - startTime, error: "Accounting timeout" });
    }, 3000);

    client.on("message", (msg) => {
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;
      try {
        const decoded = radius.decode({ packet: msg, secret });
        client.close();
        resolve({
          success: decoded.code === "Accounting-Response",
          latencyMs,
        });
      } catch (err: any) {
        client.close();
        resolve({ success: false, latencyMs, error: err.message });
      }
    });

    const attrs: any[] = [
      ["User-Name", params.username],
      ["Acct-Status-Type", params.statusType],
      ["Acct-Session-Id", params.sessionId],
      ["NAS-IP-Address", "127.0.0.1"],
      ["Acct-Input-Octets", params.inputOctets || 0],
      ["Acct-Output-Octets", params.outputOctets || 0],
      ["Acct-Session-Time", params.sessionTime || 0],
    ];

    if (params.framedIp) {
      attrs.push(["Framed-IP-Address", params.framedIp]);
    }

    const packet = radius.encode({
      code: "Accounting-Request",
      secret,
      identifier: Math.floor(Math.random() * 255),
      attributes: attrs,
    });

    client.send(packet, port, host);
  });
}
