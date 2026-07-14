import React, { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, loadFrameImageSrc, type FrameRow } from "@/lib/api/client";
import { useRecordingStore } from "@/lib/stores/recording-store";
import { format } from "date-fns";

function formatFrameTime(timestamp: string): string {
  try {
    return format(new Date(timestamp), "HH:mm");
  } catch {
    return timestamp;
  }
}

export function TimelineSection() {
  const [frames, setFrames] = useState<FrameRow[]>([]);
  const [current, setCurrent] = useState(0);
  const [frameText, setFrameText] = useState("");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [loading, setLoading] = useState(true);
  const followLatestRef = useRef(true);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef(0);
  const imageObjectUrlRef = useRef<string | null>(null);
  currentRef.current = current;
  const isGloballyPaused = useRecordingStore((s) => s.isGloballyPaused);
  const resumeAll = useRecordingStore((s) => s.resumeAll);

  useEffect(() => {
    async function loadFrames() {
      try {
        const res = await api.frames({ limit: 100 });
        const ordered = res.data.reverse();

        setFrames((prev) => {
          const wasFollowing =
            followLatestRef.current ||
            prev.length === 0 ||
            currentRef.current >= prev.length - 1;

          if (wasFollowing && ordered.length > 0) {
            setCurrent(ordered.length - 1);
            followLatestRef.current = true;
          } else if (ordered.length > 0) {
            setCurrent((c) => Math.min(c, ordered.length - 1));
          }

          return ordered;
        });
      } catch {
        setFrames([]);
      } finally {
        setLoading(false);
      }
    }

    void loadFrames();
    const interval = setInterval(() => void loadFrames(), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (frames.length === 0) return;
    const frame = frames[current];
    if (!frame) return;

    async function loadFrameDetail() {
      setImageError(false);
      if (imageObjectUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(imageObjectUrlRef.current);
        imageObjectUrlRef.current = null;
      }
      try {
        const textRes = await api.frameText(frame.id);
        setFrameText(textRes.text || "no text captured");
        const src = await loadFrameImageSrc(frame.id);
        imageObjectUrlRef.current = src.startsWith("blob:") ? src : null;
        setImageSrc(src);
      } catch {
        setFrameText("failed to load frame");
        setImageSrc(null);
        setImageError(true);
      }
    }

    void loadFrameDetail();
    return () => {
      if (imageObjectUrlRef.current?.startsWith("blob:")) {
        URL.revokeObjectURL(imageObjectUrlRef.current);
        imageObjectUrlRef.current = null;
      }
    };
  }, [frames, current]);

  useEffect(() => {
    const strip = thumbStripRef.current;
    if (!strip) return;
    const active = strip.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;

    const target =
      active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
    const maxScroll = strip.scrollWidth - strip.clientWidth;
    strip.scrollTo({
      left: Math.max(0, Math.min(target, maxScroll)),
      behavior: "smooth",
    });
  }, [current, frames.length]);

  const goToFrame = (index: number) => {
    followLatestRef.current = index >= frames.length - 1;
    setCurrent(index);
  };

  const goToLatest = () => {
    if (frames.length === 0) return;
    followLatestRef.current = true;
    setCurrent(frames.length - 1);
  };

  if (loading) {
    return (
      <div className="flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden">
        <div className="px-8 py-6 border-b border-border">
          <h1 className="text-2xl font-mono lowercase">timeline</h1>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground font-mono text-sm">
          loading frames...
        </div>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden">
        <div className="px-8 py-6 border-b border-border">
          <h1 className="text-2xl font-mono lowercase">timeline</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            browse your screen history
          </p>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-4 text-muted-foreground font-mono text-sm lowercase">
          <p>no frames captured yet — screen recording will populate this view</p>
          {isGloballyPaused && (
            <Button variant="outline" size="sm" onClick={() => void resumeAll()} className="font-mono text-xs">
              resume screen recording
            </Button>
          )}
        </div>
      </div>
    );
  }

  const frame = frames[current];
  const atLatest = current === frames.length - 1;

  return (
    <div className="flex flex-col h-full min-h-0 min-w-0 w-full overflow-hidden">
      <div className="px-8 py-6 border-b border-border flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-mono lowercase">timeline</h1>
          <p className="text-sm text-muted-foreground font-mono mt-1">
            browse your screen history · {frames.length} frames
            {followLatestRef.current && atLatest && !isGloballyPaused ? " · live" : ""}
          </p>
        </div>
        {!atLatest && (
          <Button variant="outline" size="sm" onClick={goToLatest} className="font-mono text-xs lowercase">
            jump to latest
          </Button>
        )}
      </div>

      {isGloballyPaused && (
        <div className="mx-6 mt-4 flex items-center justify-between gap-4 border border-border bg-surface px-4 py-3">
          <p className="text-xs font-mono text-muted-foreground lowercase">
            screen recording is paused — audio may still be recording. resume to capture new frames.
          </p>
          <Button variant="outline" size="sm" onClick={() => void resumeAll()} className="font-mono text-xs lowercase shrink-0">
            resume screen
          </Button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-h-0 min-w-0 p-6 gap-4 overflow-hidden">
        <div className="flex-1 border border-border bg-surface flex items-center justify-center relative min-h-[300px] overflow-hidden">
          {imageSrc && !imageError ? (
            <img
              src={imageSrc}
              alt={`frame ${frame.id}`}
              className="max-w-full max-h-full object-contain"
              onError={() => setImageError(true)}
            />
          ) : (
            <div className="text-center px-6">
              <div className="text-6xl font-mono text-muted-foreground/30 mb-4">▦</div>
              <p className="text-sm font-mono text-muted-foreground lowercase">
                frame {frame.id} — {formatFrameTime(frame.timestamp)}
              </p>
              {imageError && (
                <p className="text-xs font-mono text-muted-foreground mt-2 lowercase">
                  screenshot preview unavailable
                </p>
              )}
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-background/90 border-t border-border p-3">
            <p className="text-xs font-mono text-muted-foreground lowercase line-clamp-2">
              {frame.app_name && <span className="mr-2">{frame.app_name}</span>}
              {frameText}
            </p>
          </div>
          <div className="absolute bottom-16 left-4 right-4 flex items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToFrame(Math.max(0, current - 1))}
              disabled={current === 0}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex-1 h-1 bg-border relative">
              <div
                className="absolute top-0 left-0 h-full bg-foreground transition-all duration-150"
                style={{ width: `${((current + 1) / frames.length) * 100}%` }}
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => goToFrame(Math.min(frames.length - 1, current + 1))}
              disabled={atLatest}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div ref={thumbStripRef} className="flex gap-1 overflow-x-auto overflow-y-hidden scrollbar-hide pb-2 min-w-0 shrink-0">
          {frames.map((f, i) => (
            <button
              key={f.id}
              data-active={i === current ? "true" : "false"}
              onClick={() => goToFrame(i)}
              className={cn(
                "flex-shrink-0 w-20 h-14 border font-mono text-[10px] lowercase transition-all duration-150",
                i === current
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground",
                i === frames.length - 1 && followLatestRef.current && !isGloballyPaused && "ring-1 ring-foreground/40"
              )}
            >
              {formatFrameTime(f.timestamp)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
