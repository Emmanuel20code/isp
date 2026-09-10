const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateVoucherCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export function startOfTodayUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function startOfMonthUtc(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Normalises Kenyan numbers to 2547XXXXXXXX / 2541XXXXXXXX format. */
export function normalizeKePhone(input: string): string {
  let digits = (input || "").replace(/\D/g, "");
  if (digits.startsWith("0")) {
    digits = `254${digits.slice(1)}`;
  } else if (
    !digits.startsWith("254") &&
    digits.length === 9 &&
    (digits.startsWith("7") || digits.startsWith("1"))
  ) {
    digits = `254${digits}`;
  }
  return digits;
}

/** Validates that phone number is a valid 12-digit Kenyan phone number starting with 2547 or 2541 */
export function isValidKePhone(phone: string): boolean {
  return /^254[17]\d{8}$/.test(phone);
}

/** Formats package duration in hours, minutes, or days */
export function formatPackageDuration(hours: number): string {
  if (!hours || hours <= 0) return "0 mins";
  if (hours < 1) {
    const mins = Math.round(hours * 60);
    return `${mins} min${mins === 1 ? "" : "s"}`;
  }
  if (hours % 720 === 0 && hours >= 720) {
    const months = hours / 720;
    return `${months} month${months === 1 ? "" : "s"}`;
  }
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    const remHours = Math.round((hours % 24) * 10) / 10;
    if (remHours === 0) return `${days} day${days === 1 ? "" : "s"}`;
    return `${days}d ${remHours}h`;
  }
  if (!Number.isInteger(hours)) {
    const wholeHours = Math.floor(hours);
    const mins = Math.round((hours - wholeHours) * 60);
    if (wholeHours === 0) return `${mins} mins`;
    if (mins === 0) return `${wholeHours} hr${wholeHours === 1 ? "" : "s"}`;
    return `${wholeHours}h ${mins}m`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

export function buildMacRegex(macStr: string): string | null {
  if (!macStr) return null;
  const cleanHex = macStr.replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (cleanHex.length !== 12) return null;
  const parts: string[] = [];
  for (let i = 0; i < 12; i += 2) {
    parts.push(cleanHex.substring(i, i + 2));
  }
  return `(?i)^${parts.join("[:-]?")}$`;
}

export async function syncRadiusCredentials(
  supabaseAdmin: any,
  params: {
    username: string;
    password?: string;
    tenantId: string;
    serviceType?: "hotspot" | "pppoe" | string | null;
    macAddress?: string | null;
    rateLimit?: string | null;
    durationHours?: number | null;
    expiresAt?: string | null;
    deviceLimit?: number | null;
  }
) {
  const {
    username,
    password,
    tenantId,
    serviceType = "hotspot",
    macAddress,
    rateLimit,
    durationHours,
    expiresAt,
    deviceLimit,
  } = params;

  if (!username || !tenantId) return;

  const cleanUsername = username.trim();
  const pwd = (password || username).trim();
  const isPPPoE = serviceType === "pppoe";

  try {
    // 1. Delete old entries for clean state
    await supabaseAdmin.from("radcheck").delete().eq("username", cleanUsername);
    await supabaseAdmin.from("radreply").delete().eq("username", cleanUsername);

    // 2. Insert radcheck entries
    const checkRows: any[] = [
      {
        username: cleanUsername,
        attribute: "Cleartext-Password",
        op: ":=",
        value: pwd,
        tenant_id: tenantId,
        tenantId: tenantId,
      },
    ];

    if (isPPPoE) {
      // STRICT PPPoE: Must send Framed-Protocol = PPP
      checkRows.push({
        username: cleanUsername,
        attribute: "Framed-Protocol",
        op: "==",
        value: "PPP",
        tenant_id: tenantId,
        tenantId: tenantId,
      });
    } else {
      // STRICT Hotspot: Must NOT be PPP
      checkRows.push({
        username: cleanUsername,
        attribute: "Framed-Protocol",
        op: "!=",
        value: "PPP",
        tenant_id: tenantId,
        tenantId: tenantId,
      });

      // Bind to client device MAC address if available
      const macRegex = macAddress ? buildMacRegex(macAddress) : null;
      if (macRegex) {
        checkRows.push({
          username: cleanUsername,
          attribute: "Calling-Station-Id",
          op: "=~",
          value: macRegex,
          tenant_id: tenantId,
          tenantId: tenantId,
        });
      }
    }

    await supabaseAdmin.from("radcheck").insert(checkRows);

    // 3. Prepare radreply entries
    const replyRows: any[] = [];

    if (isPPPoE) {
      replyRows.push(
        {
          username: cleanUsername,
          attribute: "Framed-Protocol",
          op: ":=",
          value: "PPP",
          tenant_id: tenantId,
          tenantId: tenantId,
        },
        {
          username: cleanUsername,
          attribute: "Service-Type",
          op: ":=",
          value: "Framed-User",
          tenant_id: tenantId,
          tenantId: tenantId,
        }
      );
    }

    if (rateLimit) {
      replyRows.push({
        username: cleanUsername,
        attribute: "Mikrotik-Rate-Limit",
        op: ":=",
        value: rateLimit,
        tenant_id: tenantId,
        tenantId: tenantId,
      });
    }

    replyRows.push({
      username: cleanUsername,
      attribute: "Port-Limit",
      op: ":=",
      value: String(deviceLimit ?? 1),
      tenant_id: tenantId,
      tenantId: tenantId,
    });

    let timeoutSeconds = 86400; // default 24h
    if (expiresAt) {
      const msLeft = new Date(expiresAt).getTime() - Date.now();
      timeoutSeconds = Math.max(60, Math.floor(msLeft / 1000));
    } else if (durationHours && durationHours > 0) {
      timeoutSeconds = Math.max(60, Math.floor(durationHours * 3600));
    }

    replyRows.push({
      username: cleanUsername,
      attribute: "Session-Timeout",
      op: ":=",
      value: String(timeoutSeconds),
      tenant_id: tenantId,
      tenantId: tenantId,
    });

    await supabaseAdmin.from("radreply").insert(replyRows);
    console.log(
      `[RADIUS Sync] Successfully synced ${serviceType.toUpperCase()} credentials for ${cleanUsername} (MAC: ${
        macAddress || "unbound"
      }) in tenant ${tenantId}`
    );
  } catch (err) {
    console.error(`[RADIUS Sync] Error syncing credentials for ${cleanUsername}:`, err);
  }
}
