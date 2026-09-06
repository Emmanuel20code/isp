import { GoogleGenAI } from "@google/genai";
import { getPublicBaseUrl } from "@/lib/mikrotik";

// Initialize the Google Gen AI Client on the server
// User-Agent is set to 'aistudio-build' for telemetry as required by guidelines
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

export interface CustomScriptParams {
  routerId: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  onboardToken: string;
  agentKey: string;
  baseUrl: string;
  wifiName?: string;
  lanInterface?: string;
  wanInterface?: string;
  hotspotSubnet?: string;
  gatewayIp?: string;
  pppoeSubnet?: string;
  customWalledGarden?: string[];
  enableFastPath?: boolean;
  enableFailover?: boolean;
  autoRebootHour?: number | null;
  customPrompt?: string;
  referenceScript: string;
}

export async function generateAIAssistedOnboardingScript(
  params: CustomScriptParams,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn(
      "No API key configured for Gemini or OpenRouter. Falling back to reference script.",
    );
    return params.referenceScript;
  }

  // Construct precise instructions for the AI model
  const systemInstruction = `You are OX Alpha, a world-class MikroTik Network Engineer and Senior DevOps Architect specialized in the wifibilling.site billing & Hotspot captive portal system.
Your goal is to generate extremely reliable, syntax-valid, copy-pasteable MikroTik RouterOS (.rsc) configuration scripts tailored to the operator's environment and custom instructions.

The operator has a router with ID: ${params.routerId} on tenant ${params.tenantSlug} (${params.tenantName}).
The onboarding parameters and variables are:
- Platform Base URL: ${params.baseUrl}
- Hotspot Name / SSID: ${params.wifiName || "WiFiBilling Hotspot"}
- WAN Interface: ${params.wanInterface || "ether1"}
- LAN Interface/Bridge: ${params.lanInterface || "bridge-hotspot"}
- Hotspot Subnet Range: ${params.hotspotSubnet || "10.5.50.0/24"}
- Gateway IP Address: ${params.gatewayIp || "10.5.50.1"}
- PPPoE Pool Range: ${params.pppoeSubnet || "10.5.60.0/24"}
- Onboard Token: ${params.onboardToken}
- Agent Secure Key: ${params.agentKey}
- Base Walled Garden Domains: ${JSON.stringify(params.customWalledGarden || [])}
- Extra options:
  * FastPath/FastTrack: ${params.enableFastPath ? "Enabled" : "Disabled"} (Bypasses firewall queues for clean internet performance)
  * Dual-WAN Failover check: ${params.enableFailover ? "Enabled" : "Disabled"}
  * Scheduled Auto-Reboot: ${params.autoRebootHour !== null ? `Enabled at hour ${params.autoRebootHour}` : "Disabled"}

The reference base script is:
------------------------------------------
${params.referenceScript}
------------------------------------------

Instructions for Script Generation:
1. Modify the reference script's variables to use the operator's specified WAN, LAN interfaces, SSID, Subnets, and IP pools instead of defaults.
2. Incorporate any custom features requested by the operator, such as load balancing, VLAN segments, static dhcp mappings, custom firewall rules, queue trees, or advanced walled gardens.
3. Keep the core onboarding agent endpoints intact! The heartbeats must be dispatched correctly to ${params.baseUrl}/api/public/mikrotik/sync and downloads to ${params.baseUrl}/api/public/mikrotik/portal.
4. Ensure all MikroTik commands are compatible with RouterOS v6 and v7 (avoid scripts that only work on one unless specified).
5. Output ONLY the copy-pasteable MikroTik terminal code block containing the complete configuration script. Do not prefix with other prose, just return the script code wrapped in standard markdown code blocks (\`\`\`routeros ... \`\`\`).
6. Include step-by-step instructions inside the code block as comments (prefixed with #) explaining what each section does and how to paste and troubleshoot.

Operator's Custom Prompt:
"${params.customPrompt || "Configure the standard onboarding agent with these specified subnets and interfaces."}"`;

  try {
    // Generate content using gemini-3.8-flash for speedy and highly-accurate results
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents:
        "Generate the customized MikroTik onboarding script (.rsc) according to the specifications.",
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.2,
      },
    });

    const script = response.text;
    if (script && script.trim()) {
      // Return the generated script, stripping markdown block delimiters if present
      const cleanScript = script
        .replace(/^```[a-zA-Z]*\n/gm, "")
        .replace(/```$/gm, "")
        .trim();
      return cleanScript;
    }
  } catch (error) {
    console.error(
      "Gemini script generation failed, falling back to customized reference script replacement:",
      error,
    );
  }

  // Fallback to basic string template substitution if Gemini fails
  let fallbackScript = params.referenceScript;
  fallbackScript = fallbackScript.replace(/ether1/g, params.wanInterface || "ether1");
  fallbackScript = fallbackScript.replace(
    /bridge-hotspot/g,
    params.lanInterface || "bridge-hotspot",
  );
  fallbackScript = fallbackScript.replace(/MyWiFi_Hotspot/g, params.wifiName || "MyWiFi_Hotspot");
  fallbackScript = fallbackScript.replace(/10.5.50.1/g, params.gatewayIp || "10.5.50.1");
  fallbackScript = fallbackScript.replace(/10.5.50.0\/24/g, params.hotspotSubnet || "10.5.50.0/24");
  return fallbackScript;
}
