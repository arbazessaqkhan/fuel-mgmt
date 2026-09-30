"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { UploadCloud, FileImage, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export function UploadZone({
  onFileSelected,
  onClear,
  previewUrl,
  progress,
  disabled,
}: {
  onFileSelected: (file: File) => void;
  onClear: () => void;
  previewUrl: string | null;
  progress: number | null; // 0..100, null = not running
  disabled?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const validate = useCallback(
    (file: File): boolean => {
      if (!ACCEPTED.includes(file.type)) {
        toast.error("Unsupported file", {
          description: "Please upload a JPG, PNG or WebP image of the voucher.",
        });
        return false;
      }
      if (file.size > MAX_BYTES) {
        toast.error("File too large", {
          description: "Maximum upload size is 10 MB.",
        });
        return false;
      }
      return true;
    },
    []
  );

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = files?.[0];
      if (!file) return;
      if (!validate(file)) return;
      onFileSelected(file);
    },
    [onFileSelected, validate]
  );

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-lg border bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Voucher preview"
            className="mx-auto max-h-72 w-auto object-contain"
          />
          {progress != null && (
            <div className="absolute inset-x-0 bottom-0 space-y-1 bg-background/90 p-3">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Running OCR…</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}
          <Button
            size="icon"
            variant="secondary"
            className="absolute right-2 top-2"
            onClick={onClear}
            disabled={disabled || progress != null}
            aria-label="Remove image"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
          disabled={disabled}
          className={cn(
            "flex w-full flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            dragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/40",
            disabled && "cursor-not-allowed opacity-60"
          )}
        >
          {progress != null ? (
            <FileImage className="h-10 w-10 text-muted-foreground" />
          ) : (
            <UploadCloud className="h-10 w-10 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium">
              {progress != null ? "Processing image…" : "Drag & drop voucher image here"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              or click to browse — JPG, PNG or WebP, up to 10 MB
            </p>
          </div>
        </button>
      )}
    </div>
  );
}
