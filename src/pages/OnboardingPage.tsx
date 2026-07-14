import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useOnboardingStore,
  ONBOARDING_SIZES,
  type OnboardingStep,
} from "@/lib/stores/onboarding-store";
import { electron } from "@/lib/electron";

const STEPS: OnboardingStep[] = ["login", "permissions", "engine", "connect-apps", "pipe"];

function LoginSlide({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 gap-6">
      <div className="text-center">
        <h1
          className="text-3xl lowercase mb-2"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          SuperApp
        </h1>
        <p className="text-sm text-muted-foreground font-mono">
          your local ai workspace for screen, audio, and context
        </p>
      </div>
      <Button onClick={onNext} className="w-full max-w-xs">
        sign in
      </Button>
      <button className="text-xs font-mono text-muted-foreground hover:text-foreground transition-colors">
        continue without account
      </button>
    </div>
  );
}

function PermissionsSlide({ onNext }: { onNext: () => void }) {
  const perms = [
    { name: "screen recording", granted: false },
    { name: "microphone", granted: false },
    { name: "accessibility", granted: false },
  ];
  const [granted, setGranted] = useState(perms);

  return (
    <div className="flex flex-col min-h-screen p-8 gap-6">
      <h2 className="text-xl font-mono lowercase">permissions</h2>
      <p className="text-sm text-muted-foreground font-mono">
        SuperApp needs these permissions to capture your screen and audio.
      </p>
      <div className="flex flex-col border border-border">
        {granted.map((p, i) => (
          <div
            key={p.name}
            className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0"
          >
            <span className="font-mono text-sm lowercase">{p.name}</span>
            <Button
              variant={p.granted ? "outline" : "default"}
              size="sm"
              onClick={() =>
                setGranted((prev) =>
                  prev.map((item, j) => (j === i ? { ...item, granted: true } : item))
                )
              }
            >
              {p.granted ? "granted" : "grant"}
            </Button>
          </div>
        ))}
      </div>
      <Button
        onClick={onNext}
        disabled={!granted.every((p) => p.granted)}
        className="mt-auto"
      >
        continue
      </Button>
    </div>
  );
}

function EngineSlide({ onNext }: { onNext: () => void }) {
  const [status, setStatus] = useState<"starting" | "ready" | "idle" | "error">("idle");

  const start = async () => {
    setStatus("starting");
    try {
      await electron?.engine.start();
      const health = (await electron?.engine.health()) as { status?: string };
      setStatus(health?.status === "healthy" ? "ready" : "error");
    } catch {
      setStatus("error");
    }
  };

  useEffect(() => {
    void (async () => {
      try {
        const health = (await electron?.engine.health()) as { status?: string };
        if (health?.status === "healthy") setStatus("ready");
      } catch {
        // engine not running yet
      }
    })();
  }, []);

  return (
    <div className="flex flex-col min-h-screen p-8 gap-6">
      <h2 className="text-xl font-mono lowercase">start engine</h2>
      <p className="text-sm text-muted-foreground font-mono">
        the capture engine runs locally on your machine.
      </p>
      <div className="border border-border p-6 flex flex-col items-center gap-4">
        <div className="text-4xl font-mono text-muted-foreground">
          {status === "starting" ? "◐" : status === "ready" ? "●" : "○"}
        </div>
        <span className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
          {status === "starting"
            ? "starting..."
            : status === "ready"
              ? "engine ready"
              : status === "error"
                ? "engine error"
                : "not started"}
        </span>
        {status === "idle" && (
          <Button onClick={start}>start engine</Button>
        )}
      </div>
      <Button onClick={onNext} disabled={status !== "ready"} className="mt-auto">
        continue
      </Button>
    </div>
  );
}

function ConnectAppsSlide({ onNext }: { onNext: () => void }) {
  const apps = ["browser extension", "calendar", "slack"];
  const [connected, setConnected] = useState<Set<string>>(new Set());

  return (
    <div className="flex flex-col min-h-screen p-8 gap-6">
      <h2 className="text-xl font-mono lowercase">connect apps</h2>
      <p className="text-sm text-muted-foreground font-mono">
        optional integrations to enrich your context.
      </p>
      <div className="flex flex-col border border-border">
        {apps.map((app) => (
          <div
            key={app}
            className="flex items-center justify-between px-4 py-3 border-b border-border last:border-b-0"
          >
            <span className="font-mono text-sm lowercase">{app}</span>
            <Button
              variant={connected.has(app) ? "outline" : "default"}
              size="sm"
              onClick={() =>
                setConnected((prev) => {
                  const next = new Set(prev);
                  if (next.has(app)) next.delete(app);
                  else next.add(app);
                  return next;
                })
              }
            >
              {connected.has(app) ? "connected" : "connect"}
            </Button>
          </div>
        ))}
      </div>
      <Button onClick={onNext} className="mt-auto">
        continue
      </Button>
    </div>
  );
}

function PickPipeSlide({ onComplete }: { onComplete: () => void }) {
  const pipes = ["daily summary", "meeting recap", "focus tracker"];

  return (
    <div className="flex flex-col min-h-screen p-8 gap-6">
      <h2 className="text-xl font-mono lowercase">pick a pipe</h2>
      <p className="text-sm text-muted-foreground font-mono">
        choose your first automation workflow.
      </p>
      <div className="flex flex-col gap-2">
        {pipes.map((pipe) => (
          <button
            key={pipe}
            onClick={onComplete}
            className="border border-border px-4 py-3 text-left font-mono text-sm lowercase hover:bg-foreground hover:text-background transition-all duration-150"
          >
            {pipe}
          </button>
        ))}
      </div>
      <button
        onClick={onComplete}
        className="text-xs font-mono text-muted-foreground hover:text-foreground mt-auto"
      >
        skip for now
      </button>
    </div>
  );
}

export function OnboardingPage() {
  const { currentStep, isCompleted, setStep, complete } = useOnboardingStore();
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const size = ONBOARDING_SIZES[currentStep];
    electron?.setWindowSize(size.width, size.height);
  }, [currentStep]);

  useEffect(() => {
    if (isCompleted) {
      electron?.openWindow("home");
      electron?.closeWindow();
    }
  }, [isCompleted]);

  const handleNext = () => {
    const idx = STEPS.indexOf(currentStep);
    if (idx < STEPS.length - 1) {
      setVisible(false);
      setTimeout(() => {
        setStep(STEPS[idx + 1]);
        setVisible(true);
      }, 300);
    }
  };

  const handleComplete = () => {
    complete();
  };

  return (
    <div
      className={cn(
        "bg-background transition-opacity duration-300",
        visible ? "opacity-100" : "opacity-0"
      )}
    >
      {currentStep === "login" && <LoginSlide onNext={handleNext} />}
      {currentStep === "permissions" && <PermissionsSlide onNext={handleNext} />}
      {currentStep === "engine" && <EngineSlide onNext={handleNext} />}
      {currentStep === "connect-apps" && <ConnectAppsSlide onNext={handleNext} />}
      {currentStep === "pipe" && <PickPipeSlide onComplete={handleComplete} />}
    </div>
  );
}
