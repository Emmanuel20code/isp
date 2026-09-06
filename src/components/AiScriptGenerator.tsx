import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listNetwork, getAICustomRouterScript } from "@/lib/network.functions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Terminal,
  Cpu,
  Copy,
  Download,
  Sparkles,
  Bot,
  Wifi,
  Settings,
  Check,
  Zap,
  Play,
  HelpCircle,
  RefreshCw,
  AlertCircle,
  ArrowRight,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

export function AiScriptGenerator() {
  const fetchNetwork = useServerFn(listNetwork);
  const triggerAiGenerator = useServerFn(getAICustomRouterScript);

  const { data: network, isLoading: isLoadingNetwork } = useQuery({
    queryKey: ["network-data"],
    queryFn: () => fetchNetwork(),
  });

  const [selectedRouterId, setSelectedRouterId] = useState<string>("");
  const [wifiName, setWifiName] = useState<string>("WiFiBilling Hotspot");
  const [wanInterface, setWanInterface] = useState<string>("ether1");
  const [lanInterface, setLanInterface] = useState<string>("bridge-hotspot");
  const [hotspotSubnet, setHotspotSubnet] = useState<string>("10.5.50.0/24");
  const [gatewayIp, setGatewayIp] = useState<string>("10.5.50.1");
  const [pppoeSubnet, setPppoeSubnet] = useState<string>("10.5.60.0/24");

  const [enableFastPath, setEnableFastPath] = useState<boolean>(true);
  const [enableFailover, setEnableFailover] = useState<boolean>(false);
  const [autoReboot, setAutoReboot] = useState<boolean>(false);
  const [rebootHour, setRebootHour] = useState<string>("3"); // 3 AM

  const [customPrompt, setCustomPrompt] = useState<string>("");
  const [generatedScript, setGeneratedScript] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Pre-fill router selection when list loads
  useEffect(() => {
    if (network?.routers && network.routers.length > 0 && !selectedRouterId) {
      setSelectedRouterId(network.routers[0].id);
    }
  }, [network, selectedRouterId]);

  const handleGenerate = async () => {
    if (!selectedRouterId) {
      toast.error("Please select a target MikroTik router first");
      return;
    }

    setIsGenerating(true);
    setGeneratedScript("");

    try {
      const res = await triggerAiGenerator({
        data: {
          routerId: selectedRouterId,
          wifiName,
          lanInterface,
          wanInterface,
          hotspotSubnet,
          gatewayIp,
          pppoeSubnet,
          enableFastPath,
          enableFailover,
          autoRebootHour: autoReboot ? parseInt(rebootHour, 10) : null,
          customPrompt,
        },
      });

      setGeneratedScript(res.script);
      toast.success("MikroTik RouterOS script generated successfully with OX Alpha!");
    } catch (e: any) {
      toast.error(
        e.message || "Failed to generate script. Please verify your variables and try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!generatedScript) return;
    navigator.clipboard.writeText(generatedScript);
    setCopied(true);
    toast.success("Script copied to clipboard!");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!generatedScript) return;
    const blob = new Blob([generatedScript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "onboard-custom-oxalpha.rsc";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("Script downloaded successfully!");
  };

  const selectedRouter = network?.routers?.find((r) => r.id === selectedRouterId);
  const terminalCommand = selectedRouter
    ? `/tool fetch url="https://wifibilling.site/api/public/mikrotik/onboard?token=${selectedRouter.onboard_token}" dst-path=onboard.auto.rsc check-certificate=no; /import onboard.auto.rsc`
    : `/tool fetch url="https://wifibilling.site/api/public/mikrotik/onboard?token=TOKEN" dst-path=onboard.auto.rsc check-certificate=no; /import onboard.auto.rsc`;

  const samplePrompts = [
    {
      label: "Dual WAN failover",
      prompt:
        "I have main WAN on ether1 and backup fiber line on ether5. Configure recursive failover using 8.8.8.8 and 1.1.1.1.",
    },
    {
      label: "WhatsApp Walled Garden",
      prompt:
        "Add walled garden whitelisting for WhatsApp messaging servers so clients can contact support before buying vouchers.",
    },
    {
      label: "Limit Local Speed",
      prompt:
        "Set up queue simple configurations to enforce a default 10Mbps/10Mbps bandwidth limit on LAN networks.",
    },
    {
      label: "Multiple Hotspots",
      prompt:
        "Create a separate hotspot server on ether3 with subnet 192.168.100.0/24 and SSID 'Guest_WiFi_Promo'.",
    },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
      {/* Configuration Panel */}
      <Card className="xl:col-span-2 shadow-sm border border-border/80">
        <CardHeader className="py-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Settings className="size-4 text-blue-500" /> Script Configuration Engine
          </CardTitle>
          <CardDescription className="text-xs">
            Tailor network subnets, interfaces, and options to generate a fully optimized RouterOS
            script.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Target Router Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Select Target Router</Label>
            {isLoadingNetwork ? (
              <div className="h-9 w-full bg-muted/60 animate-pulse rounded border" />
            ) : (
              <Select value={selectedRouterId} onValueChange={setSelectedRouterId}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Select router..." />
                </SelectTrigger>
                <SelectContent>
                  {network?.routers?.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="text-xs">
                      {r.name} ({r.location || "No Location"}) — {r.onboard_token}
                    </SelectItem>
                  ))}
                  {(!network?.routers || network.routers.length === 0) && (
                    <SelectItem value="none" disabled className="text-xs">
                      No routers configured yet. Add a router first.
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Core Settings Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">WiFi Name (SSID)</Label>
              <Input
                value={wifiName}
                onChange={(e) => setWifiName(e.target.value)}
                placeholder="e.g. My WiFi Hotspot"
                className="h-8.5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">WAN Interface</Label>
              <Input
                value={wanInterface}
                onChange={(e) => setWanInterface(e.target.value)}
                placeholder="e.g. ether1"
                className="h-8.5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">LAN Bridge / Port</Label>
              <Input
                value={lanInterface}
                onChange={(e) => setLanInterface(e.target.value)}
                placeholder="e.g. bridge-hotspot"
                className="h-8.5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Hotspot Subnet</Label>
              <Input
                value={hotspotSubnet}
                onChange={(e) => setHotspotSubnet(e.target.value)}
                placeholder="e.g. 10.5.50.0/24"
                className="h-8.5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Gateway IP</Label>
              <Input
                value={gatewayIp}
                onChange={(e) => setGatewayIp(e.target.value)}
                placeholder="e.g. 10.5.50.1"
                className="h-8.5 text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">PPPoE Subnet Pool</Label>
              <Input
                value={pppoeSubnet}
                onChange={(e) => setPppoeSubnet(e.target.value)}
                placeholder="e.g. 10.5.60.0/24"
                className="h-8.5 text-xs"
              />
            </div>
          </div>

          <div className="border-t my-2 pt-3 space-y-3.5">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Advanced Optimization Features
            </Label>

            {/* FastPath Queue Bypass */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Zap className="size-3 text-amber-500" /> Enable FastPath / FastTrack Bypass
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Bypasses queues for system traffic to maximize gaming/streaming performance
                </div>
              </div>
              <Switch checked={enableFastPath} onCheckedChange={setEnableFastPath} />
            </div>

            {/* Dual WAN / Failover */}
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold flex items-center gap-1.5">
                  <Layers className="size-3 text-purple-500" /> Dual-WAN Failover Checker
                </div>
                <div className="text-[10px] text-muted-foreground">
                  Adds gateway checker scripts for secondary redundant connection failovers
                </div>
              </div>
              <Switch checked={enableFailover} onCheckedChange={setEnableFailover} />
            </div>

            {/* Auto Reboot scheduler */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <RefreshCw className="size-3 text-emerald-500" /> Scheduled Daily Reboot
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Runs auto-reboot to refresh memory leaks and maintain extreme uptime
                  </div>
                </div>
                <Switch checked={autoReboot} onCheckedChange={setAutoReboot} />
              </div>

              {autoReboot && (
                <div className="flex items-center gap-2 bg-muted/40 p-2 rounded-md border text-xs">
                  <span>Reboot Hour (24h format):</span>
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={rebootHour}
                    onChange={(e) => setRebootHour(e.target.value)}
                    className="h-7 w-16 text-xs text-center py-0"
                  />
                  <span>:00 AM/PM</span>
                </div>
              )}
            </div>
          </div>

          {/* AI Custom prompt */}
          <div className="border-t pt-3 space-y-1.5">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Sparkles className="size-3 text-blue-500" /> Describe Custom Requirements (Optional)
            </Label>
            <Textarea
              placeholder="e.g. Whitelist WhatsApp servers, configure a third guest LAN on ether4, set up load balancing for two WAN lines, limit default speed to 5Mbps..."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              className="text-xs min-h-[60px]"
            />

            {/* Quick prompts */}
            <div className="flex flex-wrap gap-1 mt-1">
              {samplePrompts.map((s, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCustomPrompt(s.prompt)}
                  className="text-[10px] border bg-card hover:bg-accent px-1.5 py-0.5 rounded text-muted-foreground transition-colors cursor-pointer"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !selectedRouterId}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold h-9 gap-1.5 mt-2"
          >
            {isGenerating ? (
              <>
                <RefreshCw className="size-4 animate-spin" />
                OX Alpha is coding custom configuration...
              </>
            ) : (
              <>
                <Bot className="size-4" />
                Generate Script with OX Alpha
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Script Terminal / Preview Panel */}
      <Card className="xl:col-span-3 bg-slate-950 text-slate-100 border shadow-md flex flex-col h-[650px] overflow-hidden">
        <CardHeader className="border-b border-slate-800 py-3 px-4 bg-slate-900/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="size-4 text-emerald-500" />
            <div>
              <CardTitle className="text-sm font-semibold text-slate-100">
                RouterOS RSC Script Terminal
              </CardTitle>
              <CardDescription className="text-[11px] text-slate-400">
                Generated configuration ready to import into MikroTik.
              </CardDescription>
            </div>
          </div>

          {generatedScript && (
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="h-7.5 text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-800 gap-1"
              >
                {copied ? (
                  <Check className="size-3 text-emerald-400" />
                ) : (
                  <Copy className="size-3" />
                )}
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDownload}
                className="h-7.5 text-xs text-slate-300 hover:text-slate-100 hover:bg-slate-800 border border-slate-800 gap-1"
              >
                <Download className="size-3" />
                Download
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex-1 p-0 flex flex-col min-h-0 bg-slate-950 font-mono">
          {generatedScript ? (
            <div className="flex-1 overflow-y-auto p-4 text-[11px] sm:text-xs leading-relaxed space-y-4">
              {/* Quick instructions how to run */}
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3 text-emerald-400/90 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-xs">
                  <Play className="size-3" /> How to Install On Your MikroTik:
                </div>
                <ol className="list-decimal pl-4 space-y-1 text-[10px]">
                  <li>Download the RSC file or copy the script block below.</li>
                  <li>
                    Open <strong>WinBox</strong> and connect to your router.
                  </li>
                  <li>
                    Click <strong>Files</strong>, then drag-and-drop the `.rsc` file into the list.
                  </li>
                  <li>
                    Open <strong>New Terminal</strong> and run:{" "}
                    <code className="bg-slate-900 px-1 py-0.5 rounded text-white text-[10px]">
                      /import onboard-custom-oxalpha.rsc
                    </code>
                  </li>
                </ol>
              </div>

              {/* RSC code contents */}
              <pre className="whitespace-pre-wrap overflow-x-auto text-emerald-300 bg-slate-950/50 p-3.5 rounded border border-slate-900 leading-normal font-mono select-text">
                {generatedScript}
              </pre>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center space-y-3">
              {isGenerating ? (
                <>
                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-full animate-bounce">
                    <Sparkles className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-200">
                      Writing Custom RouterOS Script...
                    </p>
                    <p className="text-[11px] text-slate-500 max-w-sm">
                      OX Alpha is designing routing tables, whitelisting payment gateways, and
                      programming scheduler loop functions...
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="p-3 bg-slate-900 rounded-full text-slate-600 border border-slate-900">
                    <Terminal className="size-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-300">Terminal Idle</p>
                    <p className="text-[11px] text-slate-500 max-w-sm">
                      Configure your network interfaces, pools, and advanced options on the left,
                      then click <strong>"Generate Script with OX Alpha"</strong> to watch the AI
                      code it in real-time.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Quick static terminal command generator */}
          <div className="border-t border-slate-800 p-3 bg-slate-900/30">
            <div className="text-[10px] text-slate-400 font-bold mb-1.5 flex items-center gap-1">
              <HelpCircle className="size-3 text-slate-500" /> Alternate: Quick Single Line Install
              Command
            </div>
            <div className="bg-slate-950 border border-slate-800 rounded p-2 flex items-center justify-between gap-3 text-[10px] sm:text-xs">
              <span className="text-slate-300 truncate select-all">{terminalCommand}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  navigator.clipboard.writeText(terminalCommand);
                  toast.success("Single line install command copied!");
                }}
                className="h-6 text-[10px] text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 px-2"
              >
                Copy
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
