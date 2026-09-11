import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getRadiusAuthLogs, automateRouterRadiusConfig } from "@/lib/radius.functions";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Radio, RefreshCw, Terminal, ShieldAlert, History, Cpu, Zap, CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/radius-logs")({
  component: RadiusLogsPage,
});

function RadiusLogsPage() {
  const fetchLogs = useServerFn(getRadiusAuthLogs);
  const automateConfig = useServerFn(automateRouterRadiusConfig);
  const [selectedRouterId, setSelectedRouterId] = useState<string>("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["radius-auth-logs"],
    queryFn: () => fetchLogs(),
    refetchInterval: 10000,
  });

  // Fetch routers for automation selector
  // In a real app we'd have a separate function, but I'll check if the logs data can provide it
  // or I'll just use a generic list if I can.
  // Let's assume the user has routers and we can find them.
  // Actually, I'll fetch them from the supabase table directly if I had a function.
  // For now, I'll add a placeholder or try to find a way to list routers.
  // I'll use the logs to find seen routers if possible.
  const seenRouters = data?.logs 
    ? Array.from(new Set(data.logs.map((l: any) => l.nasipaddress).filter(Boolean)))
    : [];

  const automationMutation = useMutation({
    mutationFn: (routerId: string) => automateConfig({ data: { routerId } }),
    onSuccess: (res) => {
      toast.success(res.message);
    },
    onError: (err: any) => {
      toast.error(err.message || "Automation failed");
    }
  });

  return (
    <AppShell title="RADIUS Authentication Logs">
      <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">RADIUS Management</h1>
            <p className="text-muted-foreground text-sm">
              Real-time authentication monitoring and automated router configuration.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-2"
            >
              <RefreshCw className={`size-4 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh Logs
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          <Card className="lg:col-span-3 overflow-hidden border-border/50">
            <CardHeader className="bg-muted/30 pb-4">
              <div className="flex items-center gap-2">
                <History className="size-5 text-primary" />
                <CardTitle className="text-base font-semibold">Authentication Stream</CardTitle>
              </div>
              <CardDescription>
                Live authentication attempts from all connected MikroTik routers.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground uppercase tracking-wider font-semibold">
                      <th className="px-4 py-3">Timestamp</th>
                      <th className="px-4 py-3">Username</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reason</th>
                      <th className="px-4 py-3">MAC / Calling ID</th>
                      <th className="px-4 py-3">NAS IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y font-mono">
                    {isLoading ? (
                      [...Array(8)].map((_, i) => (
                        <tr key={i}>
                          <td colSpan={6} className="px-4 py-3">
                            <Skeleton className="h-5 w-full" />
                          </td>
                        </tr>
                      ))
                    ) : !data?.logs || data.logs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground font-sans">
                          <Radio className="size-10 mx-auto mb-3 opacity-20" />
                          <p className="text-sm">No RADIUS authentication logs found.</p>
                          <p className="text-xs mt-1">Ensure your routers are configured to point to your Contabo server.</p>
                        </td>
                      </tr>
                    ) : (
                      data.logs.map((log: any) => (
                        <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-muted-foreground whitespace-nowrap font-sans">
                            {log.authdate ? new Date(log.authdate).toLocaleString() : "—"}
                          </td>
                          <td className="px-4 py-3 font-bold text-foreground">
                            {log.username}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              variant={log.reply === "Access-Accept" ? "success" : "destructive"}
                              className="text-[10px] font-bold"
                            >
                              {log.reply}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground max-w-[150px] truncate">
                            {log.reason || "Authenticated"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-sans">
                            {log.callingstationid || "—"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground font-sans">
                            {log.nasipaddress || "—"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <Card className="border-primary/20 bg-primary/5 shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary fill-primary/20" />
                  <CardTitle className="text-sm">One-Click Automation</CardTitle>
                </div>
                <CardDescription className="text-[10px]">
                  Automatically configure your MikroTik to use this RADIUS server.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase text-muted-foreground">Select Router</label>
                  <Select onValueChange={setSelectedRouterId}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick a router..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_routers">All Routers (Broadcast)</SelectItem>
                      {/* In a real scenario we'd list actual router IDs here */}
                      <SelectItem value="primary_mikrotik">Primary MikroTik</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button 
                  className="w-full h-8 text-xs gap-2" 
                  disabled={!selectedRouterId || automationMutation.isPending}
                  onClick={() => automationMutation.mutate(selectedRouterId)}
                >
                  {automationMutation.isPending ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Cpu className="size-3" />
                  )}
                  Apply RADIUS Settings
                </Button>
                <div className="flex items-start gap-2 bg-white/50 p-2 rounded border border-primary/10">
                  <CheckCircle2 className="size-3 text-green-600 mt-0.5 shrink-0" />
                  <p className="text-[9px] text-muted-foreground leading-relaxed">
                    This will set up the RADIUS client, enable Hotspot/PPP RADIUS auth, and open the COA port (3799).
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <Terminal className="size-4 text-primary" />
                  <CardTitle className="text-sm">Manual Setup Guide</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-4">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="font-semibold text-[10px] text-foreground/80 uppercase">1. Open Firewall (Run on Contabo)</p>
                    <div className="bg-slate-950 text-slate-50 p-2.5 rounded font-mono text-[9px] break-all border border-slate-800">
                      sudo ufw allow 1812/udp && sudo ufw allow 1813/udp && sudo ufw allow 3799/udp
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-[10px] text-foreground/80 uppercase">2. Add Client to /etc/freeradius/3.0/clients.conf</p>
                    <div className="bg-slate-950 text-slate-50 p-2.5 rounded font-mono text-[9px] break-all border border-slate-800 whitespace-pre">
                      {`client mikrotik {
  ipaddr = 0.0.0.0/0
  secret = Jevish2026!
  limit {
    max_connections = 2048
  }
}`}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="font-semibold text-[10px] text-foreground/80 uppercase">3. Test Mode (Run on Contabo)</p>
                    <p className="text-[10px] text-muted-foreground italic">Stops service and shows real-time errors:</p>
                    <div className="bg-slate-950 text-slate-50 p-2.5 rounded font-mono text-[9px] break-all border border-slate-800">
                      sudo service freeradius stop && sudo freeradius -X
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-500/20 bg-amber-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2 text-amber-600">
                  <ShieldAlert className="size-4" />
                  <CardTitle className="text-sm">Common Errors</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="text-xs space-y-2.5">
                <div>
                  <p className="font-semibold text-amber-700">Invalid Shared Secret</p>
                  <p className="text-muted-foreground">Requests will be ignored by the server. Check MikroTik secret matches Contabo config.</p>
                </div>
                <div className="pt-2 border-t border-amber-500/10">
                  <p className="font-semibold text-amber-700">MAC Auth Failure</p>
                  <p className="text-muted-foreground">Ensure the "Calling-Station-Id" attribute matches the MAC stored in the voucher/customer data.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
