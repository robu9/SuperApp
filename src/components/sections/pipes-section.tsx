import React, { useCallback, useEffect, useState } from "react";
import { Download, Loader2, Play, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api, type PipeId, type PipeListItem } from "@/lib/api/client";

function formatLastRun(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function PipesSection() {
  const [pipes, setPipes] = useState<PipeListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<PipeId | null>(null);
  const [lastOutput, setLastOutput] = useState<Record<string, string>>({});

  const loadPipes = useCallback(async () => {
    try {
      const res = await api.pipes();
      setPipes(res.data);
    } catch (err) {
      console.error("[pipes] failed to load:", err);
      setPipes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPipes();
    const timer = setInterval(() => {
      void loadPipes();
    }, 5000);
    return () => clearInterval(timer);
  }, [loadPipes]);

  const handleInstall = async (id: PipeId) => {
    setBusyId(id);
    try {
      await api.installPipe(id);
      await api.enablePipe(id, true);
      await loadPipes();
      toast.success(`${id} installed`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "install failed");
    } finally {
      setBusyId(null);
    }
  };

  const handleRun = async (pipe: PipeListItem) => {
    setBusyId(pipe.id);
    try {
      const result = await api.runPipe(pipe.id);
      if (result.status === "error") {
        toast.error(result.error ?? "pipe run failed");
        setLastOutput((prev) => ({
          ...prev,
          [pipe.id]: result.error ?? "pipe run failed",
        }));
      } else {
        const output = result.output ?? "pipe completed";
        setLastOutput((prev) => ({ ...prev, [pipe.id]: output }));
        toast.success(`${pipe.name} completed`);
      }
      await loadPipes();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "pipe run failed");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto scrollbar-minimal">
      <div className="px-8 py-6 border-b border-border">
        <h1 className="text-2xl font-mono lowercase">pipes</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">
          automation workflows for your captured context
        </p>
      </div>
      <div className="p-6 grid gap-4 md:grid-cols-2">
        {loading && pipes.length === 0 ? (
          <div className="col-span-full flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <Loader2 className="w-4 h-4 animate-spin" />
            loading pipes...
          </div>
        ) : null}
        {!loading && pipes.length === 0 ? (
          <div className="col-span-full text-sm text-muted-foreground font-mono">
            no pipes available — make sure the backend is running
          </div>
        ) : null}
        {pipes.map((pipe) => {
          const busy = busyId === pipe.id || pipe.running;
          const lastRun = formatLastRun(pipe.last_run_at);
          const output = lastOutput[pipe.id];

          return (
            <div
              key={pipe.id}
              className="border border-border p-6 flex flex-col gap-4 hover:border-foreground transition-colors duration-150"
            >
              <div className="flex items-start justify-between gap-3">
                <Workflow className="w-5 h-5 shrink-0" />
                <div className="flex flex-col items-end gap-1">
                  {pipe.installed ? (
                    <span className="text-[10px] font-mono uppercase tracking-wide border border-border px-2 py-0.5">
                      installed
                    </span>
                  ) : null}
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {pipe.schedule}
                  </span>
                </div>
              </div>
              <div>
                <h3 className="font-mono lowercase text-foreground">{pipe.name}</h3>
                <p className="text-sm text-muted-foreground font-mono mt-1">
                  {pipe.description}
                </p>
                {lastRun ? (
                  <p className="text-[11px] text-muted-foreground font-mono mt-2">
                    last run: {lastRun}
                    {pipe.last_run_status ? ` (${pipe.last_run_status})` : ""}
                  </p>
                ) : null}
              </div>
              {output ? (
                <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap border border-border p-3 max-h-40 overflow-y-auto scrollbar-minimal">
                  {output}
                </pre>
              ) : null}
              <div className="flex items-center gap-2">
                {pipe.installed ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-fit gap-2"
                    disabled={busy}
                    onClick={() => void handleRun(pipe)}
                  >
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    run
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    className="w-fit gap-2"
                    disabled={busy}
                    onClick={() => void handleInstall(pipe.id)}
                  >
                    {busy ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Download className="w-3 h-3" />
                    )}
                    install
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
