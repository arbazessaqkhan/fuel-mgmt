"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  FileUp,
  FileWarning,
  Loader2,
  Save,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

export interface BulkEntry {
  rowId: string;
  voucherNo: string;
  vehicleNo: string;
  liters: string;
  date: string;
  status: "pending" | "saving" | "saved" | "duplicate" | "failed" | "invalid";
  error?: string;
}

const EMPTY: Omit<BulkEntry, "rowId" | "status"> = {
  voucherNo: "",
  vehicleNo: "",
  liters: "",
  date: "",
};

let rowSeq = 0;
const nextRowId = () => `row-${Date.now()}-${++rowSeq}`;

function entryFromRaw(raw: {
  voucherNo: string | null;
  vehicleNo: string | null;
  liters: number | null;
  date: string | null;
}): BulkEntry {
  return {
    rowId: nextRowId(),
    voucherNo: raw.voucherNo ?? "",
    vehicleNo: raw.vehicleNo ?? "",
    liters: raw.liters != null ? String(raw.liters) : "",
    date: raw.date ?? "",
    status: "pending",
  };
}

export function BulkUpload() {
  const [entries, setEntries] = useState<BulkEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const setField = (rowId: string, key: keyof Omit<BulkEntry, "rowId" | "status">, value: string) =>
    setEntries((prev) =>
      prev.map((e) => (e.rowId === rowId ? { ...e, [key]: value, status: "pending", error: undefined } : e))
    );

  const removeRow = (rowId: string) => setEntries((prev) => prev.filter((e) => e.rowId !== rowId));

  const extractPage = useCallback(async (canvas: HTMLCanvasElement, label: string) => {
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.9)
    );
    if (!blob) throw new Error(`Could not render ${label}`);
    const fd = new FormData();
    fd.append("image", blob, "page.jpg");
    const res = await fetch("/api/ocr/bulk", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error ?? `Extraction failed for ${label}`);
    }
    const raws: Array<{
      voucherNo: string | null;
      vehicleNo: string | null;
      liters: number | null;
      date: string | null;
    }> = data.vouchers ?? [];
    const warnings: string[] = data.warnings ?? [];
    return { entries: raws.map(entryFromRaw), warnings };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setEntries([]);
      setFileName(file.name);
      setProcessing(true);
      try {
        if (file.type === "application/pdf") {
          const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
          // Vite/webpack-safe worker setup: use the bundled worker via a CDN-free
          // local URL so no network access is needed at runtime.
          const workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
          pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

          const buf = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: buf }).promise;
          const collected: BulkEntry[] = [];
          const warnings: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            setProgressLabel(`Page ${i} of ${pdf.numPages}…`);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas not supported in this browser.");
            await page.render({ canvasContext: ctx, viewport }).promise;
            const { entries: pageEntries, warnings: pageWarnings } = await extractPage(
              canvas,
              `page ${i}`
            );
            collected.push(...pageEntries);
            warnings.push(...pageWarnings.map((w) => `Page ${i}: ${w}`));
          }
          if (collected.length === 0) {
            toast.warning("No vouchers found", {
              description: warnings[0] ?? "No voucher entries were detected in this PDF.",
            });
          } else {
            toast.success(`${collected.length} entries extracted`, {
              description: warnings.length
                ? `${warnings.length} page(s) had warnings — review the entries below.`
                : "Review the entries below, then save the batch.",
            });
          }
          setEntries(collected);
        } else if (file.type.startsWith("image/")) {
          setProgressLabel("Extracting entries from image…");
          const { entries: imgEntries, warnings } = await extractPage(
            await fileToCanvas(file),
            file.name
          );
          setEntries(imgEntries);
          if (imgEntries.length === 0) {
            toast.warning("No vouchers found", { description: warnings[0] ?? "Nothing detected." });
          } else {
            toast.success(`${imgEntries.length} entries extracted`);
          }
        } else {
          toast.error("Unsupported file", { description: "Upload a PDF or an image (JPG, PNG, WebP)." });
        }
      } catch (err) {
        console.error(err);
        toast.error("Bulk extraction failed", {
          description: err instanceof Error ? err.message : "Something went wrong processing this file.",
        });
      } finally {
        setProcessing(false);
        setProgressLabel(null);
      }
    },
    [extractPage]
  );

  async function saveAll() {
    setSaving(true);
    const results = { saved: 0, duplicate: 0, failed: 0 };
    // Sequential saves so per-row status reflects reality and duplicates are
    // flagged against both the DB and rows saved earlier in this batch.
    for (const entry of entries) {
      if (entry.status === "saved") continue;
      const errs = validate(entry);
      if (errs) {
        setEntries((prev) =>
          prev.map((e) => (e.rowId === entry.rowId ? { ...e, status: "invalid", error: errs } : e))
        );
        results.failed++;
        continue;
      }
      setEntries((prev) =>
        prev.map((e) => (e.rowId === entry.rowId ? { ...e, status: "saving" } : e))
      );
      try {
        const res = await fetch("/api/vouchers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            voucherNo: entry.voucherNo.trim(),
            vehicleNo: entry.vehicleNo.trim(),
            liters: parseFloat(entry.liters),
            date: entry.date,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.status === 201) {
          setEntries((prev) =>
            prev.map((e) => (e.rowId === entry.rowId ? { ...e, status: "saved" } : e))
          );
          results.saved++;
        } else if (res.status === 409) {
          setEntries((prev) =>
            prev.map((e) =>
              e.rowId === entry.rowId ? { ...e, status: "duplicate", error: data.error } : e
            )
          );
          results.duplicate++;
        } else {
          setEntries((prev) =>
            prev.map((e) =>
              e.rowId === entry.rowId
                ? { ...e, status: "failed", error: data.error ?? "Save failed" }
                : e
            )
          );
          results.failed++;
        }
      } catch {
        setEntries((prev) =>
          prev.map((e) =>
            e.rowId === entry.rowId ? { ...e, status: "failed", error: "Network error" } : e
          )
        );
        results.failed++;
      }
    }
    setSaving(false);
    toast.success("Batch finished", {
      description: `${results.saved} saved · ${results.duplicate} duplicates · ${results.failed} failed`,
    });
  }

  const pending = entries.filter((e) => e.status === "pending" || e.status === "invalid" || e.status === "failed").length;
  const savedCount = entries.filter((e) => e.status === "saved").length;

  return (
    <div className="space-y-4">
      <div
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-accent/40"
        onClick={() => !processing && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !processing && inputRef.current?.click()}
        aria-label="Upload a PDF or image of vouchers"
      >
        {processing ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">{progressLabel ?? "Processing…"}</p>
            <p className="text-xs text-muted-foreground">
              Reading every voucher entry — large PDFs take longer.
            </p>
          </>
        ) : (
          <>
            <FileUp className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm font-medium">
              {fileName ? fileName : "Drop a voucher PDF or image here, or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">
              PDF (multi-page supported) or JPG / PNG / WebP — every voucher entry is
              extracted for review.
            </p>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.currentTarget.value = "";
        }}
      />

      {entries.length > 0 && (
        <Card className="card-premium border-border/60">
          <CardContent className="pt-6">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-semibold">{entries.length} entries</span>
                {savedCount > 0 && (
                  <Badge variant="secondary" className="gap-1">
                    <CheckCircle2 className="h-3 w-3" /> {savedCount} saved
                  </Badge>
                )}
                {pending > 0 && (
                  <Badge variant="outline" className="gap-1 text-amber-600">
                    <FileWarning className="h-3 w-3" /> {pending} to review
                  </Badge>
                )}
              </div>
              <Button onClick={saveAll} disabled={saving || pending === 0} size="sm">
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                {saving ? "Saving batch…" : `Save all (${pending})`}
              </Button>
            </div>
            <div className="max-h-[480px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[140px]">Voucher No.</TableHead>
                    <TableHead className="w-[150px]">Vehicle No.</TableHead>
                    <TableHead className="w-[110px]">Liters</TableHead>
                    <TableHead className="w-[150px]">Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[50px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.rowId} className={rowTone(e.status)}>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={e.voucherNo}
                          onChange={(ev) => setField(e.rowId, "voucherNo", ev.target.value.toUpperCase())}
                          aria-label={`Voucher number row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          value={e.vehicleNo}
                          onChange={(ev) => setField(e.rowId, "vehicleNo", ev.target.value.toUpperCase())}
                          aria-label={`Vehicle number row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          type="number"
                          step="0.01"
                          min="0"
                          value={e.liters}
                          onChange={(ev) => setField(e.rowId, "liters", ev.target.value)}
                          aria-label={`Liters row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-8"
                          type="date"
                          value={e.date}
                          onChange={(ev) => setField(e.rowId, "date", ev.target.value)}
                          aria-label={`Date row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell><StatusCell entry={e} /></TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove row ${e.voucherNo || e.rowId}`}
                          onClick={() => removeRow(e.rowId)}
                          disabled={e.status === "saving"}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function rowTone(status: BulkEntry["status"]): string {
  switch (status) {
    case "saved":
      return "bg-emerald-500/5";
    case "duplicate":
      return "bg-amber-500/10";
    case "failed":
    case "invalid":
      return "bg-destructive/5";
    default:
      return "";
  }
}

function StatusCell({ entry }: { entry: BulkEntry }) {
  switch (entry.status) {
    case "saved":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> Saved
        </span>
      );
    case "duplicate":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600" title={entry.error}>
          <Copy className="h-3.5 w-3.5" /> Duplicate
        </span>
      );
    case "failed":
    case "invalid":
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive" title={entry.error}>
          <AlertTriangle className="h-3.5 w-3.5" /> {entry.status === "invalid" ? "Invalid" : "Failed"}
        </span>
      );
    case "saving":
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
    default:
      return <span className="text-xs text-muted-foreground">Pending</span>;
  }
}

function validate(e: BulkEntry): string | null {
  if (!e.voucherNo.trim()) return "Voucher number is required";
  if (!e.vehicleNo.trim()) return "Vehicle number is required";
  const l = parseFloat(e.liters);
  if (!e.liters.trim() || Number.isNaN(l) || l <= 0) return "Liters must be a positive number";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return "Valid date required";
  return null;
}

/** Render an image File onto a canvas so it can go through the same extraction path. */
async function fileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    const scale = Math.min(2, 2000 / Math.max(img.width, 1));
    canvas.width = img.width * scale;
    canvas.height = img.height * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Skeleton kept for potential streaming page results.
export const _BulkSkeleton = () => <Skeleton className="h-24 w-full" />;
