import { Layers, Loader2, Play } from "lucide-react";
import { useCallback, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type ApiState = Record<string, unknown>;

type BatchRow = {
  index: number;
  query: string;
  status: string;
  thread_id: string;
  state?: ApiState;
};

type BatchResponse = {
  count: number;
  hitl_disabled: boolean;
  results: BatchRow[];
  errors: { index: number; query: string; detail: unknown }[];
};

async function postBatch(body: { queries: string[]; max_attempts?: number }): Promise<BatchResponse> {
  const res = await fetch("/api/tickets/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ queries: body.queries, max_attempts: body.max_attempts ?? 3 }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json()) as BatchResponse;
}

function previewText(s: string | null | undefined, max: number) {
  if (!s) {
    return "—";
  }
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

export function BatchWorkspace() {
  const [raw, setRaw] = useState(
    [
      "How do I reset my password?",
      "Please lookup order status for order 12345",
      "Refund this customer immediately",
      "Can you fix it?",
      "Timeout failure while processing request",
    ].join("\n"),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<BatchResponse | null>(null);

  const run = useCallback(async () => {
    const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    if (!lines.length) {
      setError("Add at least one non-empty line.");
      setLast(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await postBatch({ queries: lines });
      setLast(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLast(null);
    } finally {
      setLoading(false);
    }
  }, [raw]);

  return (
    <div className="relative mx-auto max-w-[1440px] px-4 py-6 pb-20 sm:px-6 lg:px-8">
      <div className="mb-6 grid gap-4 lg:grid-cols-12">
        <Card className="glass-panel-strong border-border/80 lg:col-span-5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5 text-primary" />
              Batch input
            </CardTitle>
            <CardDescription>
              One question per line (blank lines are ignored). Each line runs as its own{" "}
              <span className="font-mono">thread_id</span> through the same graph as the single-ticket tab. Up to{" "}
              <span className="font-mono">100</span> lines per run.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="batch-q">Questions (newline-separated)</Label>
              <Textarea
                id="batch-q"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                rows={14}
                className="min-h-[280px] font-mono text-sm"
                placeholder={"Line 1: …\nLine 2: …"}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Human-in-the-loop interrupt is <strong>off</strong> for batch runs so every row can finish
              without manual resume. Use the <strong>Single ticket</strong> tab to test approval pauses.
            </p>
            <Button className="w-full gap-2 sm:w-auto" disabled={loading} onClick={() => void run()}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Run batch
                </>
              )}
            </Button>
            {error ? (
              <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="glass-panel border-border/80 lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-lg">Outcomes</CardTitle>
            <CardDescription>
              {last ? (
                <>
                  Last run: <span className="font-mono">{last.count}</span> completed
                  {last.errors.length > 0 ? (
                    <>
                      , <span className="text-destructive">{last.errors.length}</span> failed (see below)
                    </>
                  ) : null}
                </>
              ) : (
                "Run the batch to see route, risk, and answer preview for each line."
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!last ? (
              <p className="rounded-lg border border-dashed border-border/80 bg-muted/40 px-4 py-12 text-center text-sm text-muted-foreground">
                No results yet.
              </p>
            ) : (
              <div className="space-y-6">
                <ScrollArea className="h-[min(80vh,640px)] rounded-lg border border-border/50">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                      <tr className="border-b border-border/60 text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">#</th>
                        <th className="px-3 py-2 font-medium">Query</th>
                        <th className="px-3 py-2 font-medium">Route</th>
                        <th className="px-3 py-2 font-medium">Risk</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium">Answer preview</th>
                      </tr>
                    </thead>
                    <tbody>
                      {last.results.map((row) => {
                        const st = row.state ?? {};
                        const route = typeof st.route === "string" ? st.route : "—";
                        const risk = typeof st.risk_level === "string" ? st.risk_level : "—";
                        const fa = typeof st.final_answer === "string" ? st.final_answer : null;
                        const pq = typeof st.pending_question === "string" ? st.pending_question : null;
                        const preview = previewText(fa ?? pq, 72);
                        return (
                          <tr
                            key={`${row.index}-${row.thread_id}`}
                            className="border-b border-border/40 odd:bg-muted/20"
                          >
                            <td className="px-3 py-2 align-top font-mono text-xs text-muted-foreground">
                              {row.index + 1}
                            </td>
                            <td className="max-w-[220px] px-3 py-2 align-top text-xs">{row.query}</td>
                            <td className="px-3 py-2 align-top">
                              <Badge variant="secondary" className="capitalize">
                                {route.replaceAll("_", " ")}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <span
                                className={cn(
                                  "text-xs font-medium",
                                  risk === "high" ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground",
                                )}
                              >
                                {risk}
                              </span>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Badge variant={row.status === "completed" ? "success" : "warning"}>
                                {row.status}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-muted-foreground">{preview}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>

                {last.errors.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-destructive">Rows that raised an exception</p>
                    <ScrollArea className="max-h-[min(40vh,280px)] rounded-lg border border-destructive/30 bg-destructive/5">
                      <table className="w-full min-w-[560px] text-left text-sm">
                        <thead className="sticky top-0 z-10 bg-destructive/10 backdrop-blur-sm">
                          <tr className="border-b border-destructive/20 text-xs uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 font-medium">#</th>
                            <th className="px-3 py-2 font-medium">Query</th>
                            <th className="px-3 py-2 font-medium">Detail</th>
                          </tr>
                        </thead>
                        <tbody>
                          {last.errors.map((row) => (
                            <tr key={`err-${row.index}-${String(row.detail)}`} className="border-b border-destructive/10">
                              <td className="px-3 py-2 align-top font-mono text-xs text-muted-foreground">
                                {row.index + 1}
                              </td>
                              <td className="max-w-[240px] px-3 py-2 align-top text-xs">{row.query}</td>
                              <td className="px-3 py-2 align-top text-xs text-destructive">
                                {typeof row.detail === "string" ? row.detail : JSON.stringify(row.detail)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </ScrollArea>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
