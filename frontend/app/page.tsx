"use client";

import { useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  BarChart3,
  ArrowLeft,
  UploadCloud,
  FileText,
  X,
} from "lucide-react";
import { InvestorDashboard } from "@/components/InvestorDashboard";
import { DotPattern } from "@/components/ui/dot-pattern";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ExtractedFinancials } from "@/lib/schema";

const BACKEND_URL = `${process.env.NEXT_PUBLIC_API_URL}/api/v1/extract-financials`;

const PROCESSING_STEPS = [
  "Parsing document structure…",
  "Identifying reporting periods…",
  "Extracting financial metrics…",
  "Validating output schema…",
];

// ── Animation variants ────────────────────────────────────────────────────────

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.13, delayChildren: 0.05 } },
};

const fadeUp = {
  hidden: { opacity: 0, y: 22, filter: "blur(8px)" },
  show: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 70, damping: 20 },
  },
};

const portalReveal = {
  hidden: { opacity: 0, scale: 0.96, y: 24, filter: "blur(14px)" },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { type: "spring" as const, stiffness: 55, damping: 18, delay: 0.38 },
  },
};

const filePop = {
  hidden: { opacity: 0, scale: 0.97, y: 8 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 90, damping: 18 },
  },
  exit: { opacity: 0, scale: 0.97, y: -8, transition: { duration: 0.15 } },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Idle ──────────────────────────────────────────────────────────────────────

function IdleView({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [spotPos, setSpotPos] = useState<{ x: number; y: number } | null>(null);

  // Border spotlight tracking
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    setSpotPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);
  const onMouseLeave = useCallback(() => setSpotPos(null), []);

  function handleFile(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      toast.error("File exceeds 20 MB limit.");
      return;
    }
    setPending(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  function handleSubmit() {
    if (pending) {
      onFile(pending);
      setPending(null);
    }
  }

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-12">

      {/* ── Charbon Titane atmosphere ─────────────────────────────────────── */}
      <DotPattern
        width={22}
        height={22}
        cx={1}
        cy={1}
        cr={1}
        className="fill-white/[0.02] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black_30%,transparent_100%)]"
      />

      {/* Luminous Engine blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.06] blur-[120px]" />
        <div className="absolute top-1/3 left-1/2 h-[300px] w-[500px] -translate-x-1/2 rounded-full bg-slate-400/[0.04] blur-[80px]" />
        <div className="absolute bottom-1/4 left-1/3 h-[200px] w-[300px] rounded-full bg-zinc-500/[0.05] blur-[70px]" />
      </div>

      {/* ── Staggered content ────────────────────────────────────────────── */}
      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="relative flex w-full max-w-lg flex-col items-center gap-5"
      >
        {/* Icon with core glow */}
        <motion.div variants={fadeUp} className="relative flex size-16 items-center justify-center">
          {/* Glow halo */}
          <BarChart3 className="absolute size-10 text-indigo-400/25 blur-[12px]" />
          {/* Crisp icon */}
          <BarChart3 className="relative size-10 text-zinc-300" />
        </motion.div>

        {/* Title */}
        <motion.h1
          variants={fadeUp}
          className="text-5xl font-extralight tracking-tighter text-white"
        >
          Asymmetrica Valuations
        </motion.h1>

        {/* Description */}
        <motion.p
          variants={fadeUp}
          className="text-center text-[13px] font-light leading-relaxed text-zinc-500 max-w-[280px]"
        >
          Drop an investor document to extract structured
          financials in seconds.
        </motion.p>

        {/* ── Glass Portal ─────────────────────────────────────────────── */}
        <motion.div
          variants={portalReveal}
          ref={cardRef}
          onMouseMove={onMouseMove}
          onMouseLeave={onMouseLeave}
          className="relative w-full p-[1px] rounded-3xl overflow-hidden"
        >
          {/* Static base border */}
          <div className="absolute inset-0 rounded-3xl border border-zinc-800/50" />

          {/* Metallic spotlight — follows cursor along the 1px border gap */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-3xl transition-opacity duration-500"
            style={{
              opacity: spotPos ? 1 : 0,
              background: spotPos
                ? `radial-gradient(380px circle at ${spotPos.x}px ${spotPos.y}px, rgba(148,163,184,0.22), transparent 65%)`
                : "none",
            }}
          />

          {/* Glass surface */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            className={cn(
              "relative rounded-[calc(1.5rem-1px)] bg-zinc-900/40 backdrop-blur-xl transition-colors duration-300",
              dragging && "bg-zinc-800/50"
            )}
          >
            <AnimatePresence mode="wait">
              {pending ? (
                /* File selected state */
                <motion.div
                  key="file"
                  variants={filePop}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex flex-col items-center justify-center gap-6 px-8 py-14 min-h-[320px]"
                >
                  {/* File info row */}
                  <div className="flex w-full max-w-sm items-center gap-3 rounded-2xl border border-zinc-800/60 bg-zinc-900/60 px-5 py-3.5">
                    <FileText className="size-5 shrink-0 text-zinc-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-light text-zinc-300">
                        {pending.name}
                      </p>
                      <p className="text-[10px] uppercase tracking-wider text-zinc-600">
                        {formatBytes(pending.size)}
                      </p>
                    </div>
                    <button
                      onClick={() => setPending(null)}
                      className="rounded-lg p-1 text-zinc-600 transition-colors hover:text-zinc-400"
                    >
                      <X className="size-4" />
                    </button>
                  </div>

                  {/* Analyze button */}
                  <button
                    onClick={handleSubmit}
                    className="group relative overflow-hidden rounded-2xl bg-zinc-100 px-8 py-3 text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-950 transition-opacity hover:opacity-90 active:scale-[0.98]"
                  >
                    Analyze Document
                  </button>

                  {/* Format hint */}
                  <p className="text-[10px] uppercase tracking-widest text-zinc-700">
                    PDF · XLSX · XLS · CSV
                  </p>
                </motion.div>
              ) : (
                /* Empty / drag state */
                <motion.div
                  key="empty"
                  variants={filePop}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  className="flex flex-col items-center justify-center gap-6 px-8 py-14 min-h-[320px] cursor-pointer"
                  onClick={() => inputRef.current?.click()}
                >
                  {/* Upload icon with glow */}
                  <div className="relative flex size-16 items-center justify-center">
                    <UploadCloud
                      className={cn(
                        "absolute size-10 blur-[12px] transition-colors duration-300",
                        dragging ? "text-indigo-400/40" : "text-zinc-500/20"
                      )}
                    />
                    <UploadCloud
                      className={cn(
                        "relative size-10 transition-colors duration-300",
                        dragging ? "text-indigo-300" : "text-zinc-500"
                      )}
                    />
                  </div>

                  {/* Upload text */}
                  <div className="space-y-2 text-center">
                    <p className="text-sm font-light text-zinc-400">
                      {dragging ? "Release to upload" : (
                        <>
                          Drop your document here, or{" "}
                          <span className="text-zinc-300 underline underline-offset-2">
                            browse
                          </span>
                        </>
                      )}
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-700">
                      PDF · XLSX · XLS · CSV — 20 MB max
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function LoadingView({ step }: { step: string }) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center gap-8 overflow-hidden px-6 py-12">

      {/* Atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-indigo-500/[0.05] blur-[100px]" />
      </div>

      {/* Spinner */}
      <div className="relative flex size-20 items-center justify-center">
        <svg className="absolute inset-0 size-full animate-spin" viewBox="0 0 80 80" fill="none">
          <circle cx="40" cy="40" r="36" stroke="rgba(255,255,255,0.05)" strokeWidth="1.5" />
          <path
            d="M40 4 a36 36 0 0 1 36 36"
            stroke="rgba(148,163,184,0.6)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        {/* Icon with glow */}
        <BarChart3 className="absolute size-7 text-indigo-400/20 blur-[8px]" />
        <BarChart3 className="relative size-7 text-zinc-500" />
      </div>

      {/* Text */}
      <div className="text-center">
        <p className="text-sm font-light tracking-wide text-zinc-300">
          Analyzing financials…
        </p>
        <p className="mt-1.5 text-[11px] uppercase tracking-[0.16em] text-zinc-600">
          {step}
        </p>
      </div>

      {/* Ghost skeleton */}
      <div className="w-full max-w-[640px] space-y-3 opacity-20">
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl bg-zinc-800/60" />
          ))}
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-3">
          <Skeleton className="h-52 rounded-2xl bg-zinc-800/60" />
          <Skeleton className="h-52 rounded-2xl bg-zinc-800/60" />
        </div>
        <Skeleton className="h-40 rounded-2xl bg-zinc-800/60" />
      </div>
    </div>
  );
}

// ── Success ───────────────────────────────────────────────────────────────────

function SuccessView({
  data,
  onReset,
}: {
  data: ExtractedFinancials;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col min-h-full">
      <nav
        className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-800/50 bg-zinc-950/80 backdrop-blur px-5 py-2.5"
        data-print-hide
      >
        {/* Logo mark */}
        <div className="relative flex size-7 items-center justify-center">
          <BarChart3 className="absolute size-4 text-indigo-400/20 blur-[6px]" />
          <BarChart3 className="relative size-4 text-zinc-400" />
        </div>
        <span className="text-sm font-extralight tracking-[0.12em] text-zinc-300">
          Asymmetrica Valuations
        </span>
        <div className="flex-1" />
        <button
          onClick={onReset}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-800/60 px-3 py-1.5 text-[11px] uppercase tracking-widest text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-300"
        >
          <ArrowLeft className="size-3" />
          New file
        </button>
      </nav>
      <main className="flex flex-1 justify-center py-6">
        <InvestorDashboard data={data} />
      </main>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Home() {
  type AppState = "idle" | "loading" | "success";
  const [state, setState] = useState<AppState>("idle");
  const [data, setData] = useState<ExtractedFinancials | null>(null);
  const [stepIdx, setStepIdx] = useState(0);

  async function handleFileSelect(file: File) {
    setState("loading");
    setStepIdx(0);

    const interval = setInterval(() => {
      setStepIdx((i) => Math.min(i + 1, PROCESSING_STEPS.length - 1));
    }, 2500);

    try {
      // Force the file into local memory before touching FormData.
      // Cloud-picker files (Google Drive, iCloud) are lazy — the OS hasn't
      // downloaded them yet. arrayBuffer() blocks until the bytes are local.
      let buffer: ArrayBuffer;
      try {
        buffer = await file.arrayBuffer();
      } catch {
        throw new Error(
          "Could not read the file. Please wait for it to fully download from Google Drive or iCloud, then try again."
        );
      }

      if (buffer.byteLength === 0) {
        throw new Error(
          "Please wait for the file to fully download from Google Drive before analyzing."
        );
      }

      const safeFile = new File([buffer], file.name, {
        type: file.type || "application/pdf",
      });

      const formData = new FormData();
      formData.append("file", safeFile);

      let res: Response;
      try {
        res = await fetch(BACKEND_URL, { method: "POST", body: formData });
      } catch (networkErr) {
        console.error("[upload] Network error during fetch:", networkErr);
        throw new Error(
          "Network error — please check your connection and try again."
        );
      }

      if (!res.ok) {
        let message = `Server error (${res.status})`;
        try {
          const body = await res.json();
          message = body?.error?.message ?? message;
        } catch {
          // response was not JSON
        }
        throw new Error(message);
      }

      const result: ExtractedFinancials = await res.json();
      setData(result);
      setState("success");
    } catch (err: unknown) {
      console.error("[upload] Failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Unexpected error — please try again."
      );
      setState("idle");
    } finally {
      clearInterval(interval);
    }
  }

  if (state === "loading") {
    return (
      <main className="flex flex-1 flex-col bg-zinc-950">
        <LoadingView step={PROCESSING_STEPS[stepIdx]} />
      </main>
    );
  }

  if (state === "success" && data) {
    return (
      <main className="flex flex-1 flex-col bg-zinc-950">
        <SuccessView data={data} onReset={() => { setData(null); setState("idle"); }} />
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-zinc-950">
      <IdleView onFile={handleFileSelect} />
    </main>
  );
}
