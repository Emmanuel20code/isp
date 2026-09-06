import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiScriptGenerator } from "@/components/AiScriptGenerator";
import {
  getAiOperationsOverview,
  chatWithOxAlpha,
  toggleAutonomousModeServerFn,
} from "@/lib/ai.functions";
import {
  Bot,
  Sparkles,
  Zap,
  Activity,
  ShieldCheck,
  Send,
  Terminal,
  Check,
  AlertTriangle,
  RefreshCw,
  Cpu,
  Clock,
  Layers,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/ai-operations")({
  component: AiOperationsPage,
});

function AiOperationsPage() {
  const qc = useQueryClient();
  const getOverview = useServerFn(getAiOperationsOverview);
  const chatFn = useServerFn(chatWithOxAlpha);
  const toggleAutoFn = useServerFn(toggleAutonomousModeServerFn);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["ai-operations-overview"],
    queryFn: () => getOverview(),
    refetchInterval: 10000,
  });

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    {
      role: string;
      content: string;
      confirmationRequired?: boolean;
      pendingTool?: { name: string; args: Record<string, unknown> };
    }[]
  >([
    {
      role: "assistant",
      content:
        "Hello! I am **OX Alpha**, the primary master operations AI agent for WiFiBilling. I manage MikroTik routers, customer subscriptions, M-Pesa payments, and hotspot captive portals using direct tool calling. How can I assist you today?",
    },
  ]);
  const [isSending, setIsSending] = useState(false);

  const handleSend = async (
    messageText?: string,
    confirmToolData?: { name: string; args: Record<string, unknown> },
  ) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() && !confirmToolData) return;

    if (!confirmToolData) {
      setInput("");
      setMessages((prev) => [...prev, { role: "user", content: textToSend }]);
    }
    setIsSending(true);

    try {
      const res = await chatFn({
        data: {
          message: textToSend,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
          confirmTool: confirmToolData,
        },
      });

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: res.content,
          confirmationRequired: res.confirmationRequired,
          pendingTool: res.pendingTool,
        },
      ]);
      qc.invalidateQueries({ queryKey: ["ai-operations-overview"] });
    } catch (e) {
      const err = e as Error;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Error communicating with OX Alpha: ${err.message}` },
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const handleToggleAutonomous = async (enabled: boolean) => {
    try {
      await toggleAutoFn({ data: { enabled } });
      qc.invalidateQueries({ queryKey: ["ai-operations-overview"] });
    } catch (e) {
      console.error(e);
    }
  };

  const quickPrompts = [
    "Show me routers that are offline.",
    "Which customers have expired subscriptions?",
    "Show today's revenue.",
    "Find failed M-Pesa payments.",
    "Diagnose router connectivity issues.",
    "Generate operational report.",
  ];

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="size-7 text-blue-500" />
              <h1 className="text-2xl font-bold tracking-tight">AI Operations — OX Alpha</h1>
              <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs gap-1 font-mono">
                <Sparkles className="size-3" /> ox-alpha Primary Agent
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Centralized autonomous AI system monitoring routers, captive portals, M-Pesa
              transactions, and subscriptions.
            </p>
          </div>

          <div className="flex items-center gap-3 bg-card border rounded-lg p-3 shadow-sm">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Zap className="size-3.5 text-amber-500" /> Autonomous AI Operations Mode
              </div>
              <div className="text-[11px] text-muted-foreground">
                Allows ox-alpha to execute approved tasks continuously
              </div>
            </div>
            <Switch
              checked={overview?.isAutonomous ?? false}
              onCheckedChange={handleToggleAutonomous}
            />
          </div>
        </div>

        <Tabs defaultValue="console" className="space-y-6">
          <TabsList className="bg-muted p-1 gap-1">
            <TabsTrigger value="console" className="text-xs font-semibold gap-1.5 py-1.5">
              <Bot className="size-3.5" /> OX Alpha Agent Console
            </TabsTrigger>
            <TabsTrigger value="script-generator" className="text-xs font-semibold gap-1.5 py-1.5">
              <Terminal className="size-3.5 text-emerald-500 animate-pulse" /> AI MikroTik Script
              Agent
            </TabsTrigger>
          </TabsList>

          <TabsContent value="console" className="space-y-6">
            {/* Status Metrics Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
                    <Bot className="size-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">
                      Primary AI Model
                    </div>
                    <div className="text-sm font-bold font-mono text-emerald-500 flex items-center gap-1">
                      ox-alpha{" "}
                      <Badge variant="outline" className="text-[10px] py-0 px-1">
                        Active
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
                    <Activity className="size-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">
                      OpenRouter Gateway
                    </div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 capitalize">
                      {overview?.openRouterStatus || "Connected"}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
                    <ShieldCheck className="size-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">Operating Mode</div>
                    <div className="text-sm font-bold">
                      {overview?.isAutonomous ? (
                        <span className="text-amber-500 flex items-center gap-1">
                          <Zap className="size-3" /> Autonomous Active
                        </span>
                      ) : (
                        <span className="text-blue-500">Interactive Copilot</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-500">
                    <Layers className="size-5" />
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground font-medium">
                      Total AI Tool Actions
                    </div>
                    <div className="text-sm font-bold font-mono">
                      {overview?.totalActionsCount || 0}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Main Grid: AI Copilot Chat Console + Quick Prompts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chat Console */}
              <Card className="lg:col-span-2 shadow-sm flex flex-col h-[600px]">
                <CardHeader className="border-b py-3 px-4 flex flex-row items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Terminal className="size-4 text-blue-500" />
                    <CardTitle className="text-sm font-semibold">OX Alpha Console</CardTitle>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => qc.invalidateQueries({ queryKey: ["ai-operations-overview"] })}
                  >
                    <RefreshCw className="size-3" /> Refresh
                  </Button>
                </CardHeader>

                <CardContent className="flex-1 p-0 overflow-hidden flex flex-col">
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                      {messages.map((m, i) => (
                        <div
                          key={i}
                          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                        >
                          <div
                            className={`max-w-[85%] rounded-lg p-3.5 text-xs sm:text-sm ${
                              m.role === "user"
                                ? "bg-blue-600 text-white"
                                : "bg-muted/70 dark:bg-slate-900 border text-foreground"
                            }`}
                          >
                            <div className="markdown-body leading-relaxed">
                              <ReactMarkdown>{m.content}</ReactMarkdown>
                            </div>

                            {/* Confirmation Button if non-autonomous confirmation is required */}
                            {m.confirmationRequired && m.pendingTool && (
                              <div className="mt-3 p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-md flex items-center justify-between gap-3">
                                <div className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                                  <AlertTriangle className="size-4" /> Requires Admin Confirmation
                                </div>
                                <Button
                                  size="sm"
                                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs h-7 gap-1 font-bold"
                                  disabled={isSending}
                                  onClick={() => handleSend("Confirm execution", m.pendingTool)}
                                >
                                  <Check className="size-3.5" /> Approve & Execute
                                </Button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {isSending && (
                        <div className="flex justify-start">
                          <div className="bg-muted border rounded-lg p-3 text-xs text-muted-foreground flex items-center gap-2">
                            <Cpu className="size-3.5 animate-spin text-blue-500" />
                            OX Alpha is analyzing database records & invoking tools...
                          </div>
                        </div>
                      )}
                    </div>
                  </ScrollArea>

                  {/* Quick Prompts Bar */}
                  <div className="p-2 border-t bg-muted/20 flex flex-wrap gap-1.5">
                    {quickPrompts.map((prompt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        disabled={isSending}
                        onClick={() => handleSend(prompt)}
                        className="text-[11px] bg-background hover:bg-accent border rounded-full px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>

                  {/* Input Form */}
                  <div className="p-3 border-t bg-card">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                      }}
                      className="flex items-center gap-2"
                    >
                      <Input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask OX Alpha to check routers, customers, M-Pesa payments, revenue..."
                        className="flex-1 text-xs sm:text-sm"
                        disabled={isSending}
                      />
                      <Button
                        type="submit"
                        disabled={isSending || !input.trim()}
                        className="bg-blue-600 hover:bg-blue-500 text-white font-bold"
                      >
                        <Send className="size-4" />
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>

              {/* AI Action Logs Sidebar */}
              <Card className="shadow-sm flex flex-col h-[600px]">
                <CardHeader className="border-b py-3 px-4">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Clock className="size-4 text-purple-500" /> Recent AI Action Logs
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    Audit trail of operations executed by ox-alpha
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex-1 p-0 overflow-hidden">
                  <ScrollArea className="h-full p-4">
                    <div className="space-y-3">
                      {overview?.recentLogs && overview.recentLogs.length > 0 ? (
                        overview.recentLogs.map(
                          (
                            log: Record<string, unknown> & {
                              id: string;
                              agent?: string;
                              action?: string;
                              tool?: string;
                              status?: string;
                              created_at: string;
                            },
                          ) => (
                            <div
                              key={log.id}
                              className="p-3 rounded-lg border bg-card/60 space-y-1.5 text-xs"
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-blue-500 flex items-center gap-1">
                                  <Bot className="size-3" /> {log.agent || "ox-alpha"}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] uppercase font-mono ${
                                    log.status === "completed"
                                      ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                                      : log.status === "pending_approval"
                                        ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                        : "bg-rose-500/10 text-rose-500 border-rose-500/20"
                                  }`}
                                >
                                  {log.status}
                                </Badge>
                              </div>

                              <div className="font-medium text-foreground">{log.action}</div>

                              {log.tool && (
                                <div className="text-[11px] font-mono text-muted-foreground bg-muted p-1 rounded">
                                  Tool: {log.tool}
                                </div>
                              )}

                              <div className="text-[10px] text-muted-foreground flex items-center gap-1 pt-1">
                                <Clock className="size-3" />
                                {new Date(log.created_at).toLocaleString()}
                              </div>
                            </div>
                          ),
                        )
                      ) : (
                        <div className="text-center py-12 text-xs text-muted-foreground">
                          No AI action logs recorded yet.
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="script-generator">
            <AiScriptGenerator />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
