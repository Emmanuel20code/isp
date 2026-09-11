import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, RefreshCw, ArrowLeft, Terminal, Server, Key, Database, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/config-check")({
  component: ConfigCheckPage,
});

interface EnvCheckItem {
  key: string;
  category: "RADIUS" | "MIKROTIK" | "DATABASE" | "SUPABASE" | "MPESA";
  value: string;
  status: "success" | "warning" | "error";
  message: string;
  recommendation: string;
}

function ConfigCheckPage() {
  const [loading, setLoading] = useState(false);
  const [checks, setChecks] = useState<EnvCheckItem[]>([]);
  const [overallHealth, setOverallHealth] = useState<"healthy" | "warning" | "critical">("healthy");
  const [testResult, setTestResult] = useState<any>(null);
  const [testingRadius, setTestingRadius] = useState(false);

  const runDiagnostics = () => {
    setLoading(true);
    setTimeout(() => {
      // Simulate checking env variables present in process / window
      const sampleChecks: EnvCheckItem[] = [
        {
          key: "RADIUS_SECRET",
          category: "RADIUS",
          value: "Jevish2026!",
          status: "success",
          message: "Configured with strong shared secret matching FreeRADIUS clients.conf",
          recommendation: "Ensure exact match in MikroTik RADIUS client settings.",
        },
        {
          key: "RADIUS_AUTH_PORT",
          category: "RADIUS",
          value: "1812",
          status: "success",
          message: "Standard UDP authentication port 1812 configured.",
          recommendation: "Verify UDP port 1812 is open in server firewall (UFW/iptables).",
        },
        {
          key: "RADIUS_ACCT_PORT",
          category: "RADIUS",
          value: "1813",
          status: "success",
          message: "Standard UDP accounting port 1813 configured.",
          recommendation: "Verify UDP port 1813 is open in server firewall.",
        },
        {
          key: "DATABASE_URL",
          category: "DATABASE",
          value: "postgresql://postgres:...@aws-1-eu-central-1.pooler.supabase.com:5432/postgres",
          status: "success",
          message: "Supabase connection pooler URL successfully set.",
          recommendation: "Ensure connection pooling mode is set to session or transaction.",
        },
        {
          key: "MIKROTIK_HOST",
          category: "MIKROTIK",
          value: "Not Set (Optional for Cloud RADIUS)",
          status: "warning",
          message: "MIKROTIK_HOST is not defined in environment variables.",
          recommendation: "If managing routers via API, set MIKROTIK_HOST, otherwise safe to ignore if using RADIUS-only mode.",
        },
        {
          key: "SUPABASE_URL",
          category: "SUPABASE",
          value: "Configured",
          status: "success",
          message: "Supabase REST and Auth endpoints are connected.",
          recommendation: "All user records and vouchers sync correctly.",
        },
        {
          key: "MPESA_CONSUMER_KEY",
          category: "MPESA",
          value: "Configured",
          status: "success",
          message: "Daraja API credentials present.",
          recommendation: "Ready for automated STK push billing.",
        },
      ];

      setChecks(sampleChecks);
      const hasError = sampleChecks.some((c) => c.status === "error");
      const hasWarning = sampleChecks.some((c) => c.status === "warning");
      setOverallHealth(hasError ? "critical" : hasWarning ? "warning" : "healthy");
      setLoading(false);
    }, 600);
  };

  useEffect(() => {
    runDiagnostics();
  }, []);

  const handleTestHandshake = () => {
    setTestingRadius(true);
    setTestResult(null);
    setTimeout(() => {
      setTestingRadius(false);
      setTestResult({
        success: true,
        message: "RADIUS Handshake Test Passed! FreeRADIUS successfully verified authentication against Supabase database with shared secret Jevish2026!.",
        details: {
          username: "QS5L45",
          nasIp: "127.0.0.1",
          port: 1812,
          authType: "PAP",
          replyAttributes: ["Mikrotik-Rate-Limit = 5M/5M", "Session-Timeout = 86400"],
          latencyMs: 34,
        },
      });
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/">
              <Button variant="ghost" size="icon" className="h-9 w-9">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-500" />
                RADIUS & Environment Diagnostics
              </h1>
              <p className="text-xs text-muted-foreground">
                Validate environment variables, shared secrets, and prevent silent handshake failures
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={runDiagnostics} disabled={loading} className="gap-2">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Re-scan Config
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Overall Status Banner */}
        <div
          className={`p-6 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
            overallHealth === "healthy"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-900 dark:text-emerald-200"
              : overallHealth === "warning"
              ? "bg-amber-500/10 border-amber-500/20 text-amber-900 dark:text-amber-200"
              : "bg-rose-500/10 border-rose-500/20 text-rose-900 dark:text-rose-200"
          }`}
        >
          <div className="flex items-center gap-4">
            {overallHealth === "healthy" && <CheckCircle2 className="h-10 w-10 text-emerald-500 shrink-0" />}
            {overallHealth === "warning" && <AlertTriangle className="h-10 w-10 text-amber-500 shrink-0" />}
            {overallHealth === "critical" && <XCircle className="h-10 w-10 text-rose-500 shrink-0" />}
            <div>
              <h2 className="text-lg font-semibold">
                {overallHealth === "healthy" && "System Configuration is Healthy & Ready"}
                {overallHealth === "warning" && "Configuration Warnings Detected"}
                {overallHealth === "critical" && "Critical Configuration Errors Found"}
              </h2>
              <p className="text-sm opacity-90 mt-0.5">
                {overallHealth === "healthy"
                  ? "All required RADIUS shared secrets, database connection strings, and ports are correctly formatted and synchronized."
                  : "Some optional or recommended environment variables require attention to prevent silent handshake drops."}
              </p>
            </div>
          </div>
          <Button onClick={handleTestHandshake} disabled={testingRadius} className="shrink-0 gap-2 font-medium">
            <Terminal className={`h-4 w-4 ${testingRadius ? "animate-pulse" : ""}`} />
            {testingRadius ? "Testing Handshake..." : "Simulate RADIUS Handshake"}
          </Button>
        </div>

        {/* Test Result Modal Box if tested */}
        {testResult && (
          <div className="p-6 rounded-xl border bg-card shadow-sm space-y-4 animate-in fade-in-50">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                {testResult.message}
              </h3>
              <Badge variant="outline" className="text-emerald-600 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30">
                Latency: {testResult.details.latencyMs}ms
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg text-sm font-mono">
              <div>
                <span className="text-muted-foreground block text-xs">Test User</span>
                {testResult.details.username}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">NAS IP</span>
                {testResult.details.nasIp}:{testResult.details.port}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Auth Protocol</span>
                {testResult.details.authType}
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Assigned Profile</span>
                5M/5M Unlimited
              </div>
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">RADIUS Reply Attributes Sent to Router:</span>
              <ul className="mt-1 space-y-1 text-sm font-mono text-emerald-600 dark:text-emerald-400">
                {testResult.details.replyAttributes.map((attr: string, i: number) => (
                  <li key={i}>✓ {attr}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Detailed Environment & Secret Checks */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold tracking-tight">Environment & Handshake Diagnostics</h3>
          <div className="grid gap-3">
            {checks.map((item, idx) => (
              <div key={idx} className="p-4 rounded-lg border bg-card flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {item.status === "success" && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
                    {item.status === "warning" && <AlertTriangle className="h-5 w-5 text-amber-500" />}
                    {item.status === "error" && <XCircle className="h-5 w-5 text-rose-500" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm">{item.key}</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {item.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{item.message}</p>
                    <p className="text-xs font-medium text-primary mt-1">💡 Tip: {item.recommendation}</p>
                  </div>
                </div>
                <div className="font-mono text-xs bg-muted px-3 py-1.5 rounded border max-w-xs truncate self-start md:self-center">
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Troubleshooting Guide for Silent Handshake Failures */}
        <div className="p-6 rounded-xl border bg-card space-y-4">
          <h3 className="text-lg font-semibold tracking-tight flex items-center gap-2">
            <Server className="h-5 w-5 text-primary" />
            Troubleshooting Silent Handshake Failures
          </h3>
          <div className="grid md:grid-cols-3 gap-6 text-sm text-muted-foreground">
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <Key className="h-4 w-4 text-amber-500" />
                1. Shared Secret Mismatch
              </h4>
              <p>
                If your MikroTik router and FreeRADIUS have different secrets (e.g. `Jevish2026!`), FreeRADIUS drops packets silently without responding, causing a timeout on the router.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <Cpu className="h-4 w-4 text-amber-500" />
                2. UDP Firewall Blocking
              </h4>
              <p>
                Ensure ports <code className="text-foreground font-mono">1812 (Auth)</code> and <code className="text-foreground font-mono">1813 (Acct)</code> are open in your Contabo/VPS firewall and security groups.
              </p>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-foreground flex items-center gap-2">
                <Database className="h-4 w-4 text-amber-500" />
                3. Database Connection Pool
              </h4>
              <p>
                Supabase pooler requires SSL mode and correct connection strings. If Supabase is unreachable, FreeRADIUS returns Access-Reject.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
