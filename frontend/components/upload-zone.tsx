"use client";

import { useRef, useState } from "react";
import { UploadCloud, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
}

const ACCEPTED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

export function UploadZone({
  onFileSelect,
  accept = ".pdf,.xlsx,.xls,.csv",
  maxSizeMB = 20,
  className,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState<File | null>(null);

  function handleFile(file: File) {
    if (file.size > maxSizeMB * 1024 * 1024) {
      alert(`File exceeds ${maxSizeMB} MB limit.`);
      return;
    }
    setPending(file);
  }

  function handleSubmit() {
    if (pending) {
      onFileSelect(pending);
      setPending(null);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (pending) {
    return (
      <div
        className={cn(
          "flex flex-col items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-8",
          className
        )}
      >
        <div className="flex items-center gap-3 rounded-lg bg-white/5 px-4 py-3 w-full max-w-sm">
          <FileText className="size-5 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{pending.name}</p>
            <p className="text-xs text-muted-foreground">{formatSize(pending.size)}</p>
          </div>
          <button
            onClick={() => setPending(null)}
            className="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <button
          onClick={handleSubmit}
          className="rounded-lg bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-80 active:translate-y-px"
        >
          Analyze Document
        </button>
      </div>
    );
  }

  return (
    <div
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors",
        dragging
          ? "border-primary/70 bg-primary/5"
          : "border-white/10 hover:border-white/20 hover:bg-white/[0.02]",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
      <div className="flex size-12 items-center justify-center rounded-full bg-white/5">
        <UploadCloud className="size-6 text-muted-foreground" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">
          Drop a file here, or{" "}
          <span className="text-primary underline-offset-2 hover:underline">browse</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          PDF, XLSX, XLS, CSV — max {maxSizeMB} MB
        </p>
      </div>
    </div>
  );
}
