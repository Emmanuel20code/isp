import { SupabaseClient } from "@supabase/supabase-js";

export interface RouterLogEntry {
  tenantId: string;
  routerId: string;
  action: string;
  payload: Record<string, unknown>;
  status: "success" | "failed" | "queued" | "delivered";
  response?: unknown;
  error?: string | null;
}

/**
 * Centralized Router Logging Service
 * Captures every request, command enqueued, sync response, and RouterOS operation
 * with raw payloads and responses for full debugging visibility.
 */
export async function logRouterActivity(db: SupabaseClient, entry: RouterLogEntry) {
  const timestamp = new Date().toISOString();
  const logPrefix = `[RouterLogger][${timestamp}][Router:${entry.routerId}][Action:${entry.action}]`;

  if (entry.status === "failed") {
    console.error(`${logPrefix} FAILED:`, entry.error);
    if (entry.response) {
      console.error(`${logPrefix} Raw Response:`, JSON.stringify(entry.response, null, 2));
    }
  } else {
    console.log(`${logPrefix} Status: ${entry.status.toUpperCase()}`);
    console.log(`${logPrefix} Payload:`, JSON.stringify(entry.payload, null, 2));
    if (entry.response) {
      console.log(`${logPrefix} Raw Response:`, JSON.stringify(entry.response, null, 2));
    }
  }

  try {
    // Record into audit logs for persistent debugging trace
    await db.from("audit_logs").insert({
      tenant_id: entry.tenantId,
      action: `router_os.${entry.action}.${entry.status}`,
      entity_type: "router",
      entity_id: entry.routerId,
      metadata: {
        payload: entry.payload,
        response: entry.response ?? null,
        error: entry.error ?? null,
        status: entry.status,
        timestamp,
      },
    });
  } catch (logErr) {
    console.error(`${logPrefix} Failed to write to audit_logs database:`, logErr);
  }
}

/**
 * Log command result update when MikroTik router syncs or executes a command.
 */
export async function logCommandExecutionResult(
  db: SupabaseClient,
  commandId: string,
  tenantId: string,
  routerId: string,
  action: string,
  status: "done" | "failed",
  result?: unknown,
  error?: string | null,
) {
  console.log(
    `[RouterExecution][Command:${commandId}][Router:${routerId}] Finished with status: ${status}`,
  );
  if (error) {
    console.error(`[RouterExecution] Error:`, error);
  }
  if (result) {
    console.log(`[RouterExecution] Result:`, JSON.stringify(result, null, 2));
  }

  try {
    await db
      .from("router_commands")
      .update({
        status,
        result: result ? (typeof result === "object" ? result : { message: result }) : null,
        error: error ?? null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", commandId);

    await logRouterActivity(db, {
      tenantId,
      routerId,
      action,
      payload: { commandId },
      status: status === "done" ? "success" : "failed",
      response: result,
      error,
    });
  } catch (err) {
    console.error(`[RouterExecution] Failed to update command status in database:`, err);
  }
}
