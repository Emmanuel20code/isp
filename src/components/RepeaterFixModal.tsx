import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Radio,
  Copy,
  Check,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { generateRepeaterProtectionScript } from "@/lib/mikrotik";

interface RepeaterFixModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routers?: Array<{ id: string; name: string }>;
  selectedRouterId?: string | null;
  onFixRouter?: (id: string) => Promise<any> | void;
  onFixAllRouters?: () => Promise<any> | void;
  isFixing?: boolean;
}

export function RepeaterFixModal({
  open,
  onOpenChange,
  routers = [],
  selectedRouterId = null,
  onFixRouter,
  onFixAllRouters,
  isFixing = false,
}: RepeaterFixModalProps) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"quick-fix" | "tenda-setup" | "how-it-works">("quick-fix");
  const [chosenRouterId, setChosenRouterId] = useState<string>(
    selectedRouterId || (routers[0]?.id ?? "")
  );

  const script = generateRepeaterProtectionScript();

  const handleCopyScript = () => {
    navigator.clipboard.writeText(script);
    setCopied(true);
    toast.success("MikroTik repeater fix script copied to clipboard!");
    setTimeout(() => setCopied(false), 2500);
  };

  const handleExecuteFix = async () => {
    if (!chosenRouterId && !selectedRouterId) {
      toast.error("Please select a router first.");
      return;
    }
    const targetId = chosenRouterId || selectedRouterId!;
    if (onFixRouter) {
      await onFixRouter(targetId);
    }
  };

  const handleExecuteAllFix = async () => {
    if (onFixAllRouters) {
      await onFixAllRouters();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="p-5 pb-4 border-b bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                <Radio className="size-5" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  Tenda Repeater / Extender Bypass Fix
                  <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                    Hotspot Security
                  </Badge>
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Force all clients behind repeaters & range extenders to hit the captive portal.
                </DialogDescription>
              </div>
            </div>
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as any)}
            className="w-full mt-3"
          >
            <TabsList className="grid grid-cols-3 h-8 text-xs">
              <TabsTrigger value="quick-fix" className="text-xs gap-1.5">
                <Zap className="size-3.5 text-amber-500" /> Remote Fix & Script
              </TabsTrigger>
              <TabsTrigger value="tenda-setup" className="text-xs gap-1.5">
                <Radio className="size-3.5 text-primary" /> Tenda Settings (2 min)
              </TabsTrigger>
              <TabsTrigger value="how-it-works" className="text-xs gap-1.5">
                <HelpCircle className="size-3.5 text-muted-foreground" /> Why it Happens
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </DialogHeader>

        <div className="p-5 space-y-4">
          {activeTab === "quick-fix" && (
            <div className="space-y-4">
              {/* Alert box */}
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-foreground space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="size-4" />
                  What this automated fix does on MikroTik:
                </div>
                <ul className="list-disc list-inside space-y-1 text-muted-foreground text-[11px] ml-1">
                  <li>
                    <strong className="text-foreground">Removes MAC-Cookie login:</strong> When 1 person paid, the repeater's MAC was cached, letting everyone else through for free. Removing this forces individual vouchers.
                  </li>
                  <li>
                    <strong className="text-foreground">Enforces 1 device per MAC:</strong> Prevents multiple IP leases sharing the repeater MAC address.
                  </li>
                  <li>
                    <strong className="text-foreground">Adds Anti-NAT TTL=1 Mangle Rule:</strong> Drops tethered NAT traffic from unauthorized secondary routers/extenders.
                  </li>
                  <li>
                    <strong className="text-foreground">Flushes active sessions:</strong> Disconnects current free rides immediately so they see the captive portal.
                  </li>
                </ul>
              </div>

              {/* 1-Click Remote Execution */}
              <div className="rounded-lg border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-foreground">1-Click Remote MikroTik Deployment</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Pushes the protection rules directly to your MikroTik router over the cloud.
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                    Instant Cloud Sync
                  </Badge>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  {routers.length > 1 && (
                    <select
                      value={chosenRouterId}
                      onChange={(e) => setChosenRouterId(e.target.value)}
                      className="text-xs h-9 px-3 rounded-md border border-input bg-background focus:outline-hidden focus:ring-1 focus:ring-primary flex-1"
                    >
                      {routers.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  )}

                  <Button
                    onClick={handleExecuteFix}
                    disabled={isFixing}
                    className="h-9 text-xs gap-1.5 font-semibold bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                  >
                    {isFixing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Zap className="size-3.5" />
                    )}
                    Push Fix to {routers.find((r) => r.id === (chosenRouterId || selectedRouterId))?.name || "Router"}
                  </Button>

                  {routers.length > 1 && onFixAllRouters && (
                    <Button
                      variant="outline"
                      onClick={handleExecuteAllFix}
                      disabled={isFixing}
                      className="h-9 text-xs gap-1.5 text-muted-foreground hover:text-foreground shrink-0"
                    >
                      Apply to All Routers ({routers.length})
                    </Button>
                  )}
                </div>
              </div>

              {/* Manual Winbox Terminal Script */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Terminal className="size-3.5 text-primary" />
                    Or Paste in MikroTik WinBox Terminal:
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopyScript}
                    className="h-7 text-xs gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10"
                  >
                    {copied ? (
                      <>
                        <Check className="size-3 text-emerald-500" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="size-3" /> Copy Terminal Script
                      </>
                    )}
                  </Button>
                </div>
                <div className="rounded-lg bg-zinc-950 p-3 border border-zinc-800 text-[11px] font-mono text-zinc-300 max-h-48 overflow-y-auto leading-relaxed select-all">
                  <pre>{script}</pre>
                </div>
              </div>
            </div>
          )}

          {activeTab === "tenda-setup" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-3 text-xs text-muted-foreground space-y-1">
                <div className="font-semibold text-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 text-sky-500" />
                  Crucial: Configure Tenda in Access Point (Bridge) Mode
                </div>
                <p className="text-[11px]">
                  By default, Tenda repeaters run in <strong>Router/Universal Repeater (NAT)</strong> mode.
                  In NAT mode, the Tenda hides all connected phones behind its own single MAC address.
                  Changing it to <strong>Access Point / Bridge mode</strong> forces each phone's real MAC
                  to be passed to MikroTik so they each see the captive portal.
                </p>
              </div>

              <div className="space-y-3">
                {/* Step 1 */}
                <div className="p-3 rounded-lg border bg-card space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                      1
                    </span>
                    <h5 className="text-xs font-bold text-foreground">
                      Open Tenda Admin Page
                    </h5>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-7">
                    Connect your phone or laptop directly to the Tenda Wi-Fi network and open browser to:
                  </p>
                  <div className="pl-7 flex items-center gap-2">
                    <code className="text-[11px] px-2 py-0.5 rounded bg-muted font-mono font-bold text-foreground">
                      http://re.tenda.cn
                    </code>
                    <span className="text-[11px] text-muted-foreground">or</span>
                    <code className="text-[11px] px-2 py-0.5 rounded bg-muted font-mono font-bold text-foreground">
                      192.168.0.254
                    </code>
                  </div>
                </div>

                {/* Step 2 */}
                <div className="p-3 rounded-lg border bg-card space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary font-bold text-[11px]">
                      2
                    </span>
                    <h5 className="text-xs font-bold text-foreground">
                      Switch Operating Mode to "Access Point (AP)"
                    </h5>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-7">
                    Go to <strong>Administration / Operating Mode</strong>:
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-muted-foreground pl-7 space-y-1">
                    <li>
                      Select <strong className="text-foreground">Access Point (AP) Mode</strong> (if connecting via LAN cable from MikroTik).
                    </li>
                    <li>
                      If repeating wirelessly without cable, select <strong className="text-foreground">Universal Repeater with Transparent Bridging / WDS</strong> so client MAC addresses are preserved.
                    </li>
                  </ul>
                </div>

                {/* Step 3 */}
                <div className="p-3 rounded-lg border bg-card space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center size-5 rounded-full bg-amber-500/10 text-amber-500 font-bold text-[11px]">
                      3
                    </span>
                    <h5 className="text-xs font-bold text-foreground">
                      Disable DHCP Server on Tenda
                    </h5>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-7">
                    Go to <strong>LAN Settings</strong> and toggle <strong>DHCP Server: OFF / Disabled</strong>.
                    This guarantees that MikroTik is the ONLY device issuing IP addresses (10.10.0.X) and redirecting traffic.
                  </p>
                </div>

                {/* Step 4 */}
                <div className="p-3 rounded-lg border bg-card space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center size-5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold text-[11px]">
                      4
                    </span>
                    <h5 className="text-xs font-bold text-foreground">
                      Use LAN Port (Not WAN)
                    </h5>
                  </div>
                  <p className="text-[11px] text-muted-foreground pl-7">
                    If connected with an Ethernet cable from MikroTik, plug the cable into the <strong>LAN port</strong> (or single Ethernet port in AP mode), never into a WAN port.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === "how-it-works" && (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border bg-card p-4 space-y-2">
                <h5 className="font-bold text-foreground flex items-center gap-1.5">
                  <AlertTriangle className="size-4 text-amber-500" />
                  Why was the Tenda repeater giving free internet?
                </h5>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  When a commercial range extender or repeater connects to your MikroTik Wi-Fi in default "Repeater Mode", it performs <strong>MAC Address Masquerading (NAT)</strong>.
                </p>
                <div className="space-y-1.5 text-[11px] text-muted-foreground">
                  <div className="p-2 rounded bg-muted/50 border">
                    <strong className="text-foreground">1. MAC Cookie Trap:</strong> If person A connects through the repeater and buys a voucher, MikroTik associates the repeater's MAC address with an authenticated session.
                  </div>
                  <div className="p-2 rounded bg-muted/50 border">
                    <strong className="text-foreground">2. Free Internet for Person B, C, D:</strong> When anyone else connects through the repeater, MikroTik sees the repeater's already-authorized MAC and lets them through without showing the captive portal!
                  </div>
                  <div className="p-2 rounded bg-muted/50 border">
                    <strong className="text-foreground">3. The Solution:</strong> Removing <code className="text-primary font-mono font-bold">mac-cookie</code> from MikroTik Hotspot profiles and putting the Tenda in <strong>Bridge / AP mode</strong> permanently prevents this leak.
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <Button
                  size="sm"
                  onClick={() => setActiveTab("quick-fix")}
                  className="text-xs gap-1.5 bg-primary text-primary-foreground font-semibold"
                >
                  <Zap className="size-3.5" /> Go to Remote Fix
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
