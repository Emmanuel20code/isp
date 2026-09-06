import { getOpenRouterApiKey, PRIMARY_MODEL, FALLBACK_MODEL } from "./config";
import { AI_TOOLS, executeAiTool } from "./tools";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface AgentMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface AgentRunOptions {
  message: string;
  history?: AgentMessage[];
  tenantId?: string;
  userId?: string;
  autonomousMode?: boolean;
}

export async function checkAutonomousMode(): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin
      .from("app_configurations")
      .select("value")
      .eq("key", "ai_autonomous_mode")
      .maybeSingle();

    if (data?.value) {
      const parsed = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
      return Boolean(parsed);
    }
  } catch {
    // default false
  }
  return false;
}

export async function runOxAlphaAgent(options: AgentRunOptions) {
  const apiKey = getOpenRouterApiKey();
  const isAutonomous = options.autonomousMode ?? (await checkAutonomousMode());

  const systemPrompt = `You are OX Alpha, the primary master network engineer & operations AI agent for WiFiBilling SaaS platform.
You have 100% authority over MikroTik router management, captive portals, customer subscriptions, M-Pesa STK Push payments, and network health monitoring.

Instructions:
1. Always use available tools to query real Supabase data rather than inventing or hallucinating database information.
2. Be concise, professional, and precise in your network engineering diagnoses.
3. When answering questions about revenue, customers, routers, or payments, always run the appropriate read tools first.
4. If asked to perform actions like creating customers, packages, granting or revoking access, perform the corresponding tool calls.`;

  const messages: AgentMessage[] = [
    { role: "system", content: systemPrompt },
    ...(options.history || []),
    { role: "user", content: options.message },
  ];

  // Map AI_TOOLS to OpenRouter tools format
  const toolsFormatted = AI_TOOLS.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  let activeModel = process.env.OPENROUTER_MODEL || PRIMARY_MODEL;

  async function callOpenRouter(modelName: string, msgList: AgentMessage[]) {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://wifibilling.site",
        "X-Title": "WiFiBilling SaaS Platform",
      },
      body: JSON.stringify({
        model: modelName,
        messages: msgList,
        tools: toolsFormatted,
        tool_choice: "auto",
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      // If primary ox-alpha fails with 404 or invalid model, retry with fallback model
      if (
        modelName === PRIMARY_MODEL &&
        (res.status === 404 || errText.includes("No endpoints found"))
      ) {
        console.warn(
          `Model ${PRIMARY_MODEL} not found on OpenRouter, retrying with fallback model ${FALLBACK_MODEL}`,
        );
        activeModel = FALLBACK_MODEL;
        return callOpenRouter(FALLBACK_MODEL, msgList);
      }
      throw new Error(`OpenRouter API Error (${res.status}): ${errText}`);
    }

    return await res.json();
  }

  try {
    let responseData = await callOpenRouter(activeModel, messages);
    let choice = responseData.choices?.[0]?.message;

    // Handle tool calls loop (up to 5 iterations max)
    let iterations = 0;
    const actionLogs: any[] = [];

    while (choice?.tool_calls && choice.tool_calls.length > 0 && iterations < 5) {
      iterations++;
      messages.push(choice);

      for (const toolCall of choice.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          toolArgs = {};
        }

        const toolDef = AI_TOOLS.find((t) => t.name === toolName);
        const category = toolDef?.category || "READ";

        // If non-autonomous and operation is WRITE or DANGEROUS, check confirmation
        if (!isAutonomous && (category === "WRITE" || category === "DANGEROUS")) {
          const logEntry = {
            agent: "ox-alpha",
            action: `Requested ${toolName}`,
            tool: toolName,
            input: toolArgs,
            result: { confirmation_required: true, category },
            status: "pending_approval",
            user_id: options.userId,
            tenant_id: options.tenantId,
          };
          await supabaseAdmin.from("ai_action_logs").insert(logEntry);

          return {
            content: `I am ready to execute the action **${toolName}** with arguments: \`${JSON.stringify(toolArgs)}\`. Because Autonomous Mode is currently disabled, please confirm if you want me to proceed with this operation.`,
            confirmationRequired: true,
            pendingTool: { name: toolName, args: toolArgs },
            activeModel,
            isAutonomous,
          };
        }

        // Execute tool
        let resultData: any;
        let status = "completed";
        try {
          resultData = await executeAiTool(toolName, toolArgs, options.tenantId);
        } catch (err: any) {
          resultData = { error: err.message };
          status = "failed";
        }

        // Record in ai_action_logs
        const logRecord = {
          agent: "ox-alpha",
          action: `Executed ${toolName}`,
          tool: toolName,
          input: toolArgs,
          result: resultData,
          status,
          user_id: options.userId,
          tenant_id: options.tenantId,
        };
        await supabaseAdmin.from("ai_action_logs").insert(logRecord);
        actionLogs.push(logRecord);

        // Feed tool result back to model
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: toolName,
          content: JSON.stringify(resultData),
        });
      }

      // Query OpenRouter again with tool results
      responseData = await callOpenRouter(activeModel, messages);
      choice = responseData.choices?.[0]?.message;
    }

    return {
      content: choice?.content || "OX Alpha processed your request.",
      activeModel,
      isAutonomous,
      actionLogs,
    };
  } catch (err: any) {
    console.error("[runOxAlphaAgent] Error:", err);
    throw new Error(err.message || "AI Agent Execution Failed");
  }
}
