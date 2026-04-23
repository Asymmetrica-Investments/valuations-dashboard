"use client";

import * as React from "react";
import { toast } from "sonner";
import { BarChart3, ArrowLeft } from "lucide-react";
import { UploadZone } from "@/components/ui/upload-zone";
import { Button } from "@/components/ui/button";
import { InvestorDashboard } from "@/components/InvestorDashboard";
import { cn } from "@/lib/utils";
import type { UniformInvestorFinancialModel } from "@/lib/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AppState =
  | { status: "idle" }
  | { status: "processing" }
  | { status: "success"; data: UniformInvestorFinancialModel };

// ---------------------------------------------------------------------------
// Processing view
// ---------------------------------------------------------------------------

function ProcessingView() {
  const steps = [
    "Reading document structure…",
    "Identifying financial tables…",
    "Normalizing metric series…",
    "Validating against schema…",
  ];
  const [stepIndex, setStepIndex] = React.useState(0);

  React.useEffect(() => {
    const id = setInterval(() => {
      setStepIndex((i) => (i + 1) % steps.length);
    }, 1800);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {/* Spinner ring */}
      <div className="relative flex items-center justify-center w-20 h-20">
        <div className="absolute inset-0 rounded-full border-2 border-border" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
        <BarChart3 className="w-7 h-7 text-primary" strokeWidth={1.5} />
      </div>

      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground tracking-tight">
          Normalizing financial models…
        </p>
        <p
          key={stepIndex}
          className="text-sm text-muted-foreground animate-in fade-in duration-500"
        >
          {steps[stepIndex]}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Success / Dashboard view
// ---------------------------------------------------------------------------

function SuccessView({
  data,
  onReset,
}: {
  data: UniformInvestorFinancialModel;
  onReset: () => void;
}) {
  return (
    <div className="w-full flex flex-col items-center gap-4">
      {/* Slim top bar with reset — hidden in print */}
      <div className="w-full max-w-[1100px] flex items-center justify-between px-0.5 print:hidden">
        <div className="flex items-center gap-2 text-muted-foreground/50">
          <BarChart3 className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span className="text-[10px] font-semibold tracking-widest uppercase">DD-Dash</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          New upload
        </Button>
      </div>

      <InvestorDashboard data={data} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Idle / Upload view
// ---------------------------------------------------------------------------

function IdleView({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  return (
    <div className="w-full max-w-lg space-y-8">
      {/* Wordmark */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2.5 mb-1">
          <BarChart3 className="w-5 h-5 text-primary" strokeWidth={1.5} />
          <span className="text-sm font-semibold tracking-[0.2em] text-muted-foreground uppercase">
            DD-Dash
          </span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground leading-tight">
          Due Diligence,
          <br />
          <span className="text-muted-foreground font-light">normalized.</span>
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
          Upload any investor financial document — pitch deck financials, model
          exports, or data room spreadsheets — and get a clean, structured data
          model in seconds.
        </p>
      </div>

      {/* Upload zone */}
      <UploadZone
        accept=".pdf,.xlsx,.xls,.csv"
        maxSizeMB={20}
        onFileSelect={onFileSelect}
        className="min-h-[180px]"
      />

      <p className="text-center text-xs text-muted-foreground/50">
        PDF · XLSX · CSV · max 20 MB
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root page — state machine
// ---------------------------------------------------------------------------

export default function Home() {
  const [state, setState] = React.useState<AppState>({ status: "idle" });

  const handleFileSelect = React.useCallback(async (file: File) => {
    setState({ status: "processing" });

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/process-financials", {
        method: "POST",
        body: form,
      });

      if (!res.ok) {
        let message = `Server error ${res.status}`;
        try {
          const body = await res.json();
          if (typeof body?.error === "string") message = body.error;
        } catch {
          // response wasn't JSON — use status text
        }
        throw new Error(message);
      }

      const data: UniformInvestorFinancialModel = await res.json();
      setState({ status: "success", data });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";

      toast.error("Extraction failed", {
        description: message,
        duration: 6000,
      });

      setState({ status: "idle" });
    }
  }, []);

  return (
    <main className={cn(
      "relative min-h-screen bg-background flex flex-col items-center p-6 overflow-hidden",
      state.status !== "success" ? "justify-center" : "justify-start pt-8"
    )}>
      {/* Subtle background glow — hidden in print */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center print:hidden"
      >
        <div className="w-[600px] h-[600px] rounded-full bg-primary/[0.04] blur-3xl" />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center w-full">
        {state.status === "idle" && (
          <IdleView onFileSelect={handleFileSelect} />
        )}

        {state.status === "processing" && <ProcessingView />}

        {state.status === "success" && (
          <SuccessView
            data={state.data}
            onReset={() => setState({ status: "idle" })}
          />
        )}
      </div>
    </main>
  );
}
