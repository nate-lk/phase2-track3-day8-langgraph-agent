import { Layers, Sparkles } from "lucide-react";

import { BatchWorkspace } from "@/components/batch-workspace";
import { TicketWorkspace } from "@/components/ticket-workspace";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function App() {
  return (
    <div className="mesh-gradient relative min-h-dvh text-foreground">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(15,23,42,0.06),_transparent_55%)] dark:bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.04),_transparent_55%)]" />

      <Tabs defaultValue="single" className="relative z-10 w-full">
        <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/30 to-violet-500/20 ring-1 ring-border">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold tracking-tight sm:text-lg">Agent Desk</span>
                  <Badge variant="muted" className="font-mono text-[10px] uppercase tracking-wider">
                    LangGraph lab
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground sm:text-sm">
                  Single-ticket console and batch routing smoke tests.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <TabsList className="h-9 bg-muted/50">
                <TabsTrigger value="single" className="gap-1.5 px-3 text-xs sm:text-sm">
                  <Sparkles className="h-3.5 w-3.5 opacity-70" />
                  Single ticket
                </TabsTrigger>
                <TabsTrigger value="batch" className="gap-1.5 px-3 text-xs sm:text-sm">
                  <Layers className="h-3.5 w-3.5 opacity-70" />
                  Batch run
                </TabsTrigger>
              </TabsList>
              <ThemeToggle />
              <Button variant="glass" size="sm" className="hidden sm:inline-flex" asChild>
                <a href="/api/health" target="_blank" rel="noreferrer">
                  API health
                </a>
              </Button>
            </div>
          </div>
        </nav>

        <TabsContent value="single" className="mt-0 outline-none focus-visible:ring-0">
          <TicketWorkspace />
        </TabsContent>
        <TabsContent value="batch" className="mt-0 outline-none focus-visible:ring-0">
          <BatchWorkspace />
        </TabsContent>
      </Tabs>
    </div>
  );
}
