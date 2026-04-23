"use client";

import * as React from "react";
import { Upload, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFileSelect?: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
  className?: string;
}

export function UploadZone({
  onFileSelect,
  accept = ".pdf,.xlsx,.xls,.csv",
  maxSizeMB = 20,
  className,
}: UploadZoneProps) {
  const [isDragging, setIsDragging] = React.useState(false);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFile = (file: File) => {
    setError(null);
    if (file.size > maxSizeBytes) {
      setError(`File exceeds ${maxSizeMB}MB limit.`);
      return;
    }
    setSelectedFile(file);
    onFileSelect?.(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const clearFile = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      className={cn(
        "relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors cursor-pointer select-none",
        "border-border bg-muted/30 text-muted-foreground",
        "hover:border-primary/50 hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isDragging && "border-primary bg-primary/5 text-foreground",
        selectedFile && "border-primary/40 bg-primary/5",
        className
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="sr-only"
      />

      {selectedFile ? (
        <>
          <FileText className="h-8 w-8 text-primary" strokeWidth={1.5} />
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={clearFile}
            className="absolute right-3 top-3 rounded-sm p-1 text-muted-foreground opacity-70 transition hover:opacity-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </>
      ) : (
        <>
          <Upload className="h-8 w-8" strokeWidth={1.5} />
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {isDragging ? "Drop file here" : "Drag & drop or click to upload"}
            </p>
            <p className="text-xs">PDF, Excel, or CSV · max {maxSizeMB}MB</p>
          </div>
        </>
      )}

      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
