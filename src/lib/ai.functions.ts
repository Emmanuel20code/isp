import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { runOxAlphaAgent, checkAutonomousMode, executeAiTool } from "@/lib/ai";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const chatWithOxAlpha = createServerFn({ method: "POST" })
  .validator(
    (d: {
      message: string;
      history?: any[];
      tenantId?: string;
      confirmTool?: { name: string; args: any };
    }) => d,
  )
  .handler(async ({ data }) => {
    try {
      // If user confirms a pending tool execution
      if (data.confirmTool) {
        const result = await executeAiTool(
          data.confirmTool.name,
          data.confirmTool.args,
          data.tenantId,
        );
        await supabaseAdmin.from("ai_action_logs").insert({
          agent: "ox-alpha",
          action: `Confirmed & Executed ${data.confirmTool.name}`,
          tool: data.confirmTool.name,
          input: data.confirmTool.args,
          result,
          status: "completed",
          tenant_id: data.tenantId,
        });

        return {
          content: `✅ Action **${data.confirmTool.name}** executed successfully!\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
          activeModel: "ox-alpha",
          isAutonomous: await checkAutonomousMode(),
        };
      }

      const response = await runOxAlphaAgent({
        message: data.message,
        history: data.history,
        tenantId: data.tenantId,
      });

      return response;
    } catch (e: any) {
      console.error("[chatWithOxAlpha] Error:", e);
      throw new Error(e.message || "Failed to communicate with OX Alpha AI Agent.");
    }
  });

export const getAiOperationsOverview = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const isAutonomous = await checkAutonomousMode();
    const apiKey = process.env.OPENROUTER_API_KEY;

    const { data: logs } = await supabaseAdmin
      .from("ai_action_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    const { count: totalActions } = await supabaseAdmin
      .from("ai_action_logs")
      .select("*", { count: "exact", head: true });

    return {
      aiStatus: apiKey ? "online" : "unconfigured",
      primaryModel: "ox-alpha",
      activeModel: process.env.OPENROUTER_MODEL || "ox-alpha",
      openRouterStatus: apiKey ? "connected" : "missing_api_key",
      isAutonomous,
      totalActionsCount: totalActions || 0,
      recentLogs: logs || [],
    };
  } catch (e: any) {
    console.error("[getAiOperationsOverview] Error:", e);
    return {
      aiStatus: "error",
      primaryModel: "ox-alpha",
      activeModel: "ox-alpha",
      openRouterStatus: "error",
      isAutonomous: false,
      totalActionsCount: 0,
      recentLogs: [],
    };
  }
});

export const toggleAutonomousModeServerFn = createServerFn({ method: "POST" })
  .validator((d: { enabled: boolean }) => d)
  .handler(async ({ data }) => {
    await executeAiTool("toggle_autonomous_mode", { enabled: data.enabled });
    return { success: true, enabled: data.enabled };
  });
