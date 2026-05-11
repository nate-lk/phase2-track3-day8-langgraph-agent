import {
  Activity,
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  Copy,
  Hash,
  Loader2,
  Send,
  Shield,
  Ticket,
  User,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type RunStatus = "idle" | "loading";

type ApiState = Record<string, unknown>;

type TicketResponse = {
  status: string;
  thread_id: string;
  state?: ApiState;
  interrupts?: { id?: string | null; value: unknown }[];
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

function ticketNumber(threadId: string | null) {
  if (!threadId) {
    return "TKT-DRAFT";
  }
  const tail = threadId.replace(/[^a-zA-Z0-9]/g, "").slice(-8).toUpperCase();
  return `TKT-${tail || "NEW"}`;
}

function isEventRow(x: unknown): x is { node?: string; event_type?: string; message?: string } {
  return typeof x === "object" && x !== null;
}

const PRIORITIES = ["P1 — Critical", "P2 — High", "P3 — Normal", "P4 — Low"] as const;

export function TicketWorkspace() {
  const [query, setQuery] = useState("How do I reset my password?");
  const [useInterrupt, setUseInterrupt] = useState(false);
  const [runStatus, setRunStatus] = useState<RunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<TicketResponse | null>(null);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [resumeComment, setResumeComment] = useState("Approved from Agent Desk");
  const [priorityIdx, setPriorityIdx] = useState(2);
  const [copied, setCopied] = useState(false);

  const state = lastResponse?.state;
  const route = typeof state?.route === "string" ? state.route : "";
  const events = Array.isArray(state?.events) ? state?.events : [];
  const finalAnswer = typeof state?.final_answer === "string" ? state.final_answer : null;
  const pendingQuestion = typeof state?.pending_question === "string" ? state.pending_question : null;

  const workflowLabel = useMemo(() => {
    if (runStatus === "loading") {
      return "Running workflow";
    }
    if (!lastResponse) {
      return "Draft";
    }
    if (lastResponse.status === "interrupted") {
      return "Awaiting approval";
    }
    return "Completed";
  }, [lastResponse, runStatus]);

  const statusVariant = useMemo(() => {
    if (runStatus === "loading") {
      return "secondary" as const;
    }
    if (!lastResponse) {
      return "outline" as const;
    }
    if (lastResponse.status === "interrupted") {
      return "warning" as const;
    }
    return "success" as const;
  }, [lastResponse, runStatus]);

  const submitTicket = useCallback(async () => {
    setRunStatus("loading");
    setError(null);
    try {
      const data = await postJson<TicketResponse>("/api/tickets", {
        query,
        use_interrupt: useInterrupt,
      });
      setLastResponse(data);
      setThreadId(data.thread_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLastResponse(null);
    } finally {
      setRunStatus("idle");
    }
  }, [query, useInterrupt]);

  const resume = useCallback(
    async (approved: boolean) => {
      if (!threadId) {
        return;
      }
      setRunStatus("loading");
      setError(null);
      try {
        const data = await postJson<TicketResponse>(`/api/tickets/${threadId}/resume`, {
          approved,
          comment: resumeComment,
        });
        setLastResponse(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setRunStatus("idle");
      }
    },
    [threadId, resumeComment],
  );

  const copyThread = useCallback(async () => {
    if (!threadId) {
      return;
    }
    await navigator.clipboard.writeText(threadId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [threadId]);

  return (
    <div className="relative mx-auto max-w-[1440px] px-4 py-6 pb-20 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5">
          {/* Ticket header ribbon — full width */}
          <Card
            className={cn(
              "glass-panel-strong animate-fade-in border-border/80 lg:col-span-12",
              "overflow-hidden",
            )}
          >
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4 pb-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1 font-mono">
                    <Hash className="h-3.5 w-3.5" />
                    {ticketNumber(threadId)}
                  </span>
                  <ChevronRight className="h-3 w-3 opacity-50" />
                  <span className="inline-flex items-center gap-1">
                    <Ticket className="h-3.5 w-3.5" />
                    Support
                  </span>
                  {route ? (
                    <>
                      <ChevronRight className="h-3 w-3 opacity-50" />
                      <Badge variant="secondary" className="capitalize">
                        {route.replaceAll("_", " ")}
                      </Badge>
                    </>
                  ) : null}
                </div>
                <CardTitle className="text-balance text-lg leading-snug sm:text-xl">
                  {query.trim().slice(0, 120)}
                  {query.trim().length > 120 ? "…" : ""}
                </CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    Opened {new Date().toLocaleString()}
                  </span>
                  {threadId ? (
                    <button
                      type="button"
                      onClick={() => void copyThread()}
                      className="inline-flex items-center gap-1 rounded-md text-primary hover:underline"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      {copied ? "Copied thread id" : "Copy thread id"}
                    </button>
                  ) : null}
                </CardDescription>
              </div>
              <div className="flex flex-col items-start gap-2 sm:items-end">
                <Badge variant={statusVariant} className="px-3 py-1 text-xs font-semibold">
                  {workflowLabel}
                </Badge>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="border-border/80 bg-muted/40 text-[10px] uppercase">
                    Channel · Web
                  </Badge>
                  <Badge variant="outline" className="border-border/80 bg-muted/40 text-[10px] uppercase">
                    {PRIORITIES[priorityIdx]?.split(" — ")[0] ?? "P3"}
                  </Badge>
                </div>
              </div>
            </CardHeader>
          </Card>

          {/* Main column — conversation + composer */}
          <div className="flex flex-col gap-4 lg:col-span-8">
            <Card className="glass-panel flex min-h-[320px] flex-1 flex-col border-border/80">
              <CardHeader className="border-b border-border/50 pb-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <User className="h-4 w-4 text-muted-foreground" />
                      Customer request
                    </CardTitle>
                    <CardDescription>Initial message sent to the intake node</CardDescription>
                  </div>
                  {runStatus === "loading" ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" aria-label="Loading" />
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4 pt-5">
                <div className="rounded-xl border border-border/50 bg-muted/55 p-4 ring-1 ring-inset ring-border/40">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                    {query || "—"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="composer" className="text-muted-foreground">
                    Edit request before run
                  </Label>
                  <Textarea
                    id="composer"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Describe the issue, order id, or escalation…"
                    className="min-h-[120px] resize-y border-border/80 bg-muted/60 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-4 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/50 px-3 py-2">
                    <Switch
                      id="hitl"
                      checked={useInterrupt}
                      onCheckedChange={(v) => setUseInterrupt(Boolean(v))}
                    />
                    <div className="space-y-0.5">
                      <Label htmlFor="hitl" className="flex cursor-pointer items-center gap-2 text-sm">
                        <Shield className="h-3.5 w-3.5 text-amber-400" />
                        Human in the loop
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Pauses at approval for risky paths (refund, delete, …).
                      </p>
                    </div>
                  </div>
                  <Button
                    size="lg"
                    className="gap-2 shadow-lg shadow-primary/20"
                    disabled={runStatus === "loading" || !query.trim()}
                    onClick={() => void submitTicket()}
                  >
                    {runStatus === "loading" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Running graph…
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Run workflow
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Activity timeline — bento tile */}
            <Card className="glass-panel border-border/80 lg:min-h-[220px]">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-sky-400" />
                  System activity
                </CardTitle>
                <CardDescription>Append-only events from graph nodes (audit trail)</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                {events.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/80 bg-muted/50 px-4 py-8 text-center text-sm text-muted-foreground">
                    No runs yet. Submit the ticket to populate the timeline.
                  </p>
                ) : (
                  <ScrollArea className="h-[200px] pr-3">
                    <ol className="relative space-y-0 border-l border-border pl-5">
                      {events.map((raw, i) => {
                        const ev = isEventRow(raw) ? raw : {};
                        const node = typeof ev.node === "string" ? ev.node : "node";
                        const msg = typeof ev.message === "string" ? ev.message : JSON.stringify(raw);
                        return (
                          <li key={`${node}-${i}`} className="mb-4 last:mb-0">
                            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border border-border bg-primary shadow ring-2 ring-background" />
                            <div className="rounded-lg border border-border/50 bg-muted/55 px-3 py-2">
                              <div className="flex flex-wrap items-center gap-2 text-xs">
                                <Badge variant="secondary" className="font-mono text-[10px]">
                                  {node}
                                </Badge>
                                <span className="text-muted-foreground">{msg}</span>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar — properties + SLA + HITL + output */}
          <div className="flex flex-col gap-4 lg:col-span-4">
            <Card className="glass-panel border-border/80">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Properties</CardTitle>
                <CardDescription>Fields your ITSM would sync from identity and policy</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3">
                  <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/50 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Requester</span>
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      Web user
                    </span>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Priority</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {PRIORITIES.map((p, i) => (
                        <Button
                          key={p}
                          type="button"
                          variant={priorityIdx === i ? "default" : "outline"}
                          size="sm"
                          className={cn(
                            "h-8 border-border/80 px-2 text-[11px]",
                            priorityIdx === i ? "" : "bg-muted/50",
                          )}
                          onClick={() => setPriorityIdx(i)}
                        >
                          {p.split(" — ")[0]}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <Separator className="bg-border" />
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-border/50 bg-muted/50 p-3">
                      <p className="text-muted-foreground">First response</p>
                      <p className="mt-1 font-mono text-sm text-emerald-300">{"< 2m"} (sim)</p>
                    </div>
                    <div className="rounded-lg border border-border/50 bg-muted/50 p-3">
                      <p className="text-muted-foreground">SLA clock</p>
                      <p className="mt-1 font-mono text-sm">Paused on HITL</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {lastResponse?.status === "interrupted" ? (
              <Card className="glass-panel-strong border-amber-500/25 bg-amber-500/[0.07]">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-amber-950 dark:text-amber-100">
                    <AlertCircle className="h-4 w-4" />
                    Approval gate
                  </CardTitle>
                  <CardDescription className="text-amber-900/80 dark:text-amber-100/70">
                    Graph is waiting on a human decision before continuing.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <ScrollArea className="h-[120px] rounded-md border border-border/80 bg-muted/70 p-3">
                    <pre className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {JSON.stringify(lastResponse.interrupts, null, 2)}
                    </pre>
                  </ScrollArea>
                  <div className="space-y-2">
                    <Label htmlFor="resume-c">Reviewer note</Label>
                    <Input
                      id="resume-c"
                      value={resumeComment}
                      onChange={(e) => setResumeComment(e.target.value)}
                      className="border-border/80 bg-muted/60"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button className="flex-1 gap-1 bg-emerald-600 hover:bg-emerald-600/90" onClick={() => void resume(true)}>
                      <CheckCircle2 className="h-4 w-4" />
                      Approve
                    </Button>
                    <Button variant="destructive" className="flex-1 gap-1" onClick={() => void resume(false)}>
                      Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            {error ? (
              <Card className="glass-panel border-red-500/30 bg-red-500/10">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-red-200">
                    <AlertCircle className="h-4 w-4" />
                    Request failed
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-red-800 dark:text-red-100/90">
                    {error}
                  </pre>
                </CardContent>
              </Card>
            ) : null}

            {lastResponse ? (
              <Card className="glass-panel border-border/80">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-4 w-4 text-violet-400" />
                    Agent output
                  </CardTitle>
                  <CardDescription>Structured state returned after the last step</CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="answer">
                    <TabsList className="w-full justify-start bg-muted/60">
                      <TabsTrigger value="answer">Resolution</TabsTrigger>
                      <TabsTrigger value="json">Raw JSON</TabsTrigger>
                    </TabsList>
                    <TabsContent value="answer" className="mt-3">
                      <ScrollArea className="h-[180px] rounded-lg border border-border/50 bg-muted/60 p-4">
                        <div className="space-y-3 text-sm">
                          {finalAnswer ? (
                            <p className="whitespace-pre-wrap leading-relaxed">{finalAnswer}</p>
                          ) : pendingQuestion ? (
                            <p className="whitespace-pre-wrap text-amber-900 dark:text-amber-200/90">
                              {pendingQuestion}
                            </p>
                          ) : (
                            <p className="text-muted-foreground">No final answer yet.</p>
                          )}
                        </div>
                      </ScrollArea>
                    </TabsContent>
                    <TabsContent value="json" className="mt-3">
                      <ScrollArea className="h-[180px] rounded-lg border border-border/50 bg-muted/70 p-3">
                        <pre className="font-mono text-[11px] leading-relaxed text-muted-foreground">
                          {JSON.stringify(state ?? {}, null, 2)}
                        </pre>
                      </ScrollArea>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            ) : null}

            {/* Small bento — routing insight */}
            <Card className="glass-panel border-border/80 bg-gradient-to-br from-violet-500/10 to-transparent">
              <CardContent className="flex items-center gap-4 p-5">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/15 ring-1 ring-violet-400/20">
                  <Shield className="h-7 w-7 text-violet-300" />
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Routing policy
                  </p>
                  <p className="mt-1 text-sm text-foreground/90">
                    Keyword-first classification — risky intents require approval when HITL is on.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
    </div>
  );
}
