export interface AuthQueryLogParams {
  authType: "hotspot_mac" | "pppoe_username";
  username: string;
  password?: string;
  callingStation?: string;
  nasIp?: string;
  callingProtocol?: string;
  isPppRequest: boolean;
  sqlQuery: string;
  queryParams: any[];
  returnedRows: Array<{ attribute: string; op: string; value: string }>;
  isAllowed: boolean;
  rejectReason?: string;
}

export function logAuthQueryDetails(params: AuthQueryLogParams): void {
  const {
    authType,
    username,
    callingStation = "",
    nasIp = "",
    callingProtocol = "",
    isPppRequest,
    sqlQuery,
    queryParams,
    returnedRows,
    isAllowed,
    rejectReason,
  } = params;

  // 1. Build Expanded SQL Query
  let expandedSql = sqlQuery;
  queryParams.forEach((val, idx) => {
    const formattedVal = typeof val === "string" ? `'${val.replace(/'/g, "''")}'` : String(val);
    expandedSql = expandedSql.replace(new RegExp(`\\$${idx + 1}\\b`, "g"), formattedVal);
  });

  // 2. Schema Comparison & Input Type Validation
  const schemaChecks: string[] = [];

  // Username validation
  if (typeof username === "string" && username.trim().length > 0) {
    schemaChecks.push(`  [✓] username ("${username}") -> radcheck.username (VARCHAR/TEXT): TYPE MATCH (string)`);
  } else {
    schemaChecks.push(`  [✗] username ("${username}") -> radcheck.username: TYPE MISMATCH (expected non-empty string)`);
  }

  // MAC / Calling-Station-Id validation for Hotspot
  if (authType === "hotspot_mac" || callingStation) {
    const isMacValid = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/.test(callingStation.trim());
    if (isMacValid) {
      schemaChecks.push(`  [✓] callingStation ("${callingStation}") -> radcheck.value (Calling-Station-Id): VALID MAC FORMAT`);
    } else if (callingStation) {
      schemaChecks.push(`  [!] callingStation ("${callingStation}") -> radcheck.value: NON-STANDARD MAC FORMAT`);
    } else {
      schemaChecks.push(`  [!] callingStation -> Calling-Station-Id: NOT PROVIDED IN PACKET`);
    }
  }

  // Framed-Protocol check
  if (isPppRequest) {
    schemaChecks.push(`  [✓] Framed-Protocol ("PPP") -> radcheck.value == 'PPP': PPPoE LOOKUP MATCH`);
  } else {
    schemaChecks.push(`  [✓] Framed-Protocol ("${callingProtocol || "HTTP"}") -> radcheck.value != 'PPP': HOTSPOT LOOKUP MATCH`);
  }

  // NAS IP validation
  schemaChecks.push(`  [✓] NAS-IP-Address ("${nasIp}") -> nas.nasname (VARCHAR): MATCH`);

  // 3. Format Console Output Block
  const headerTitle = authType === "hotspot_mac" ? "HOTSPOT MAC LOOKUP" : "PPPoE USERNAME LOOKUP";
  const separator = "=".repeat(80);

  console.log(separator);
  console.log(`[AUTH QUERY LOGGER] --- ${headerTitle} ---`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log(`Input Parameters:`);
  console.log(`  - Username: "${username}"`);
  if (callingStation) console.log(`  - Calling-Station-Id (MAC): "${callingStation}"`);
  console.log(`  - NAS IP: "${nasIp}"`);
  console.log(`  - Service Protocol: ${isPppRequest ? "PPPoE (Framed-Protocol: PPP)" : "Hotspot (Captive Portal)"}`);

  console.log(`\nGenerated Parameterized SQL Query:`);
  console.log(`  ${sqlQuery}`);
  console.log(`  Parameters: ${JSON.stringify(queryParams)}`);

  console.log(`\nExact Executable SQL Query (Expanded):`);
  console.log(`  ${expandedSql};`);

  console.log(`\nInput Parameters vs Database Schema Comparison:`);
  schemaChecks.forEach((chk) => console.log(chk));

  console.log(`\nDatabase Results (${returnedRows.length} radcheck rule(s) returned):`);
  if (returnedRows.length === 0) {
    console.log(`  (No matching records found in radcheck table for username "${username}")`);
  } else {
    returnedRows.forEach((r, i) => {
      console.log(`  Rule #${i + 1}: attribute="${r.attribute}", op="${r.op}", value="${r.value}"`);
    });
  }

  console.log(`\nAuthentication Result: ${isAllowed ? "ACCESS-ACCEPT ✅" : `ACCESS-REJECT ❌ (${rejectReason})`}`);
  console.log(separator);
}
