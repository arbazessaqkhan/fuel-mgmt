"use client";

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  Eye,
  FileUp,
  FileWarning,
  Loader2,
  Save,
  Trash2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { compressImage } from "@/lib/image-compress";
import { cn } from "@/lib/utils";

export interface BulkEntry {
  rowId: string;
  voucherNo: string;
  vehicleNo: string;
  liters: string;
  date: string;
  status: "pending" | "saving" | "saved" | "duplicate" | "failed" | "invalid";
  error?: string;
}

const EMPTY_ROW: Omit<BulkEntry, "rowId" | "status"> = {
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
  const queryClient = useQueryClient();
  const [entries, setEntries] = useState<BulkEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [pageBlobs, setPageBlobs] = useState<Map<string, Blob>>(new Map());
  const [pageUrls, setPageUrls] = useState<Map<string, string>>(new Map());
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadedBlobUrlsRef = useRef<Map<Blob, string>>(new Map());
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopBulk = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProcessing(false);
    setProgressLabel(null);
    toast.info("Bulk extraction stopped. You can edit any extracted entries or upload a brand new file.");
  }, []);

  const handleResetAll = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setProcessing(false);
    setProgressLabel(null);
    setEntries([]);
    setFileName(null);
    pageUrls.forEach((u) => URL.revokeObjectURL(u));
    setPageUrls(new Map());
    setPageBlobs(new Map());
    toast.info("Cleared. You can upload a brand new file.");
  }, [pageUrls]);

  const uploadBlobsConcurrently = useCallback(async (blobs: Blob[]) => {
    const unique = Array.from(new Set(blobs)).filter((b) => !uploadedBlobUrlsRef.current.has(b));
    if (unique.length === 0) return;
    await Promise.all(
      unique.map(async (blob) => {
        try {
          const compressed = await compressImage(blob);
          const fd = new FormData();
          fd.append("file", compressed, "voucher-page.jpg");
          const up = await fetch("/api/uploads", { method: "POST", body: fd });
          if (up.ok) {
            const ud = await up.json();
            if (ud.url) uploadedBlobUrlsRef.current.set(blob, ud.url);
          }
        } catch (e) {
          console.warn("Background bulk image upload failed", e);
        }
      })
    );
  }, []);

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
    const res = await fetch("/api/ocr/bulk", {
      method: "POST",
      body: fd,
      signal: abortControllerRef.current?.signal,
    });
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
    // Keep the page blob so it can be attached to every voucher saved from
    // this page (same behavior as single-entry image retention).
    return { entries: raws.map(entryFromRaw), warnings, pageBlob: blob };
  }, []);

  const handleFile = useCallback(
    async (file: File) => {
      setEntries([]);
      setFileName(file.name);
      setProcessing(true);
      pageUrls.forEach((u) => URL.revokeObjectURL(u));
      setPageUrls(new Map());

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        const isImage = file.type.startsWith("image/") || /\.(jpe?g|png|webp|avif|bmp)$/i.test(file.name);

        if (isPdf) {
          const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
          // Reliable local worker setup: use the bundled worker served via /pdf.worker.min.mjs
          if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
          }

          const buf = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: buf }).promise;
          const collected: BulkEntry[] = [];
          const warnings: string[] = [];
          const pageBlobs = new Map<string, Blob>(); // rowId → page image
          const pageUrlsMap = new Map<string, string>();
          const urlByBlob = new Map<Blob, string>();
          for (let i = 1; i <= pdf.numPages; i++) {
            if (abortController.signal.aborted) break;
            setProgressLabel(`Page ${i} of ${pdf.numPages}…`);
            const page = await pdf.getPage(i);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Canvas not supported in this browser.");
            await page.render({ canvasContext: ctx, viewport }).promise;
            if (abortController.signal.aborted) break;
            try {
              const { entries: pageEntries, warnings: pageWarnings, pageBlob } = await extractPage(
                canvas,
                `page ${i}`
              );
              if (abortController.signal.aborted) break;
              let pUrl = urlByBlob.get(pageBlob);
              if (!pUrl) {
                pUrl = URL.createObjectURL(pageBlob);
                urlByBlob.set(pageBlob, pUrl);
              }
              for (const e of pageEntries) {
                pageBlobs.set(e.rowId, pageBlob);
                pageUrlsMap.set(e.rowId, pUrl);
              }
              collected.push(...pageEntries);
              warnings.push(...pageWarnings.map((w) => `Page ${i}: ${w}`));
            } catch (pageErr) {
              if (abortController.signal.aborted) break;
              console.warn(`Extraction notice for page ${i}:`, pageErr);
              warnings.push(
                `Page ${i}: ${pageErr instanceof Error ? pageErr.message : "Service busy on this page"}`
              );
            }
          }
          if (abortController.signal.aborted) return;
          if (collected.length === 0) {
            toast.warning("No vouchers found", {
              description: warnings[0] ?? "No voucher entries were detected in this PDF.",
            });
          } else {
            toast.success(`${collected.length} entries extracted`, {
              description: warnings.length
                ? `${warnings.length} page(s) had notices — review the entries below.`
                : "Review the entries below, then save the batch.",
            });
          }
          setPageBlobs(pageBlobs);
          setPageUrls(pageUrlsMap);
          setEntries(collected);
          uploadBlobsConcurrently(Array.from(pageBlobs.values()));
        } else if (isImage) {
          setProgressLabel("Extracting entries from image…");
          const { entries: imgEntries, warnings, pageBlob } = await extractPage(
            await fileToCanvas(file),
            file.name
          );
          if (abortController.signal.aborted) return;
          const pUrl = URL.createObjectURL(pageBlob);
          const imgMap = new Map<string, Blob>();
          const urlMap = new Map<string, string>();
          for (const e of imgEntries) {
            imgMap.set(e.rowId, pageBlob);
            urlMap.set(e.rowId, pUrl);
          }
          setPageBlobs(imgMap);
          setPageUrls(urlMap);
          setEntries(imgEntries);
          uploadBlobsConcurrently(Array.from(imgMap.values()));
          if (imgEntries.length === 0) {
            toast.warning("No vouchers found", { description: warnings[0] ?? "Nothing detected." });
          } else {
            toast.success(`${imgEntries.length} entries extracted`);
          }
        } else {
          toast.error("Unsupported file", { description: "Upload a PDF or an image (JPG, PNG, WebP)." });
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || abortControllerRef.current?.signal.aborted) {
          return;
        }
        console.warn("Bulk upload extraction notice:", err);
        toast.error("Bulk extraction notice", {
          description: err instanceof Error ? err.message : "Something went wrong processing this file.",
        });
      } finally {
        setProcessing(false);
        setProgressLabel(null);
      }
    },
    [extractPage, uploadBlobsConcurrently]
  );

  async function saveAll() {
    setSaving(true);
    const results = { saved: 0, duplicate: 0, failed: 0 };

    // Parallel upload of any remaining page blobs (most are already uploaded in background)
    await uploadBlobsConcurrently(Array.from(pageBlobs.values()));

    const imageUrlByRow = new Map<string, string>();
    for (const entry of entries) {
      const blob = pageBlobs.get(entry.rowId);
      if (blob && uploadedBlobUrlsRef.current.has(blob)) {
        imageUrlByRow.set(entry.rowId, uploadedBlobUrlsRef.current.get(blob)!);
      }
    }
    // Concurrent chunked saves (3 at a time) for 3x faster network throughput
    const toSave = entries.filter((e) => e.status !== "saved");
    const CHUNK_SIZE = 3;
    for (let i = 0; i < toSave.length; i += CHUNK_SIZE) {
      const chunk = toSave.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (entry) => {
          const errs = validate(entry);
          if (errs) {
            setEntries((prev) =>
              prev.map((e) => (e.rowId === entry.rowId ? { ...e, status: "invalid", error: errs } : e))
            );
            results.failed++;
            return;
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
                imageUrl: imageUrlByRow.get(entry.rowId) ?? null,
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
        })
      );
    }
    setSaving(false);
    if (results.saved > 0) {
      queryClient.invalidateQueries({ queryKey: ["vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["stats"] });
      queryClient.invalidateQueries({ queryKey: ["vehicle"] });
    }
    try {
      sessionStorage.removeItem("fuellog_cached_stats");
      sessionStorage.removeItem("fuellog_cached_vouchers");
      sessionStorage.removeItem("fuellog_cached_total");
    } catch {
      // sessionStorage may not be available in all contexts
    }
    toast.success("Batch finished", {
      description: `${results.saved} saved · ${results.duplicate} duplicates · ${results.failed} failed`,
    });
  }

  const pending = entries.filter((e) => e.status === "pending" || e.status === "invalid" || e.status === "failed").length;
  const savedCount = entries.filter((e) => e.status === "saved").length;

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
          dragOver
            ? "border-primary bg-primary/5"
            : "border-border hover:border-primary/50 hover:bg-accent/40",
          processing && "cursor-wait opacity-80"
        )}
        onClick={() => !processing && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!processing) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (processing) return;
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
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
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleStopBulk();
              }}
              className="mt-2 h-8 px-3 gap-1.5 font-medium bg-red-600 hover:bg-red-700 text-white shadow-xs"
            >
              <XCircle className="h-4 w-4" /> Stop / Cancel Extraction
            </Button>
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
          <CardContent className="p-3 sm:p-6 pt-4 sm:pt-6">
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
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetAll}
                  disabled={saving || processing}
                  className="gap-1.5 text-xs border-border/80 hover:border-destructive/40 hover:text-destructive"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Cancel / Upload Brand New File
                </Button>
                <Button onClick={saveAll} disabled={saving || pending === 0} size="sm">
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  {saving ? "Saving batch…" : `Save all (${pending})`}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-foreground sm:hidden px-1 mb-1.5 font-medium">
              <span>Scroll horizontally to see all fields</span>
              <span className="font-semibold text-primary">⇄ Swipe</span>
            </div>

            <div className="w-full max-h-[480px] overflow-x-auto overflow-y-auto rounded-lg border border-border/70 bg-card shadow-xs">
              <Table className="w-full min-w-[760px]">
                <TableHeader className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800/90 border-b-2 border-border/80">
                  <TableRow className="hover:bg-transparent border-b-2 border-border/80 bg-slate-100/90 dark:bg-slate-800/90">
                    <TableHead className="w-[76px] min-w-[76px] font-bold text-slate-800 dark:text-slate-100">Receipt</TableHead>
                    <TableHead className="w-[140px] min-w-[140px] font-bold text-slate-800 dark:text-slate-100">Voucher No.</TableHead>
                    <TableHead className="w-[140px] min-w-[140px] font-bold text-slate-800 dark:text-slate-100">Vehicle No.</TableHead>
                    <TableHead className="w-[105px] min-w-[105px] font-bold text-slate-800 dark:text-slate-100">Liters</TableHead>
                    <TableHead className="w-[155px] min-w-[155px] font-bold text-slate-800 dark:text-slate-100">Date</TableHead>
                    <TableHead className="w-[105px] min-w-[105px] font-bold text-slate-800 dark:text-slate-100">Status</TableHead>
                    <TableHead className="w-[48px] min-w-[48px] font-bold text-slate-800 dark:text-slate-100" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((e) => (
                    <TableRow key={e.rowId} className={rowTone(e.status)}>
                      <TableCell className="w-[76px] min-w-[76px] py-1.5">
                        {pageUrls.get(e.rowId) ? (
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewImage({
                                url: pageUrls.get(e.rowId)!,
                                title: `Receipt for Voucher ${e.voucherNo || "—"} (${e.vehicleNo || "Review"})`,
                              })
                            }
                            className="group relative flex h-10 w-14 items-center justify-center overflow-hidden rounded border border-border bg-muted/60 transition-all hover:ring-2 hover:ring-primary/60 hover:shadow-sm"
                            title="Click to view full voucher receipt"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={pageUrls.get(e.rowId)}
                              alt="Voucher receipt"
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                              <Eye className="h-4 w-4 text-white drop-shadow" />
                            </div>
                          </button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="w-[140px] min-w-[140px]">
                        <Input
                          className="h-8 text-xs sm:text-sm"
                          value={e.voucherNo}
                          onChange={(ev) => setField(e.rowId, "voucherNo", ev.target.value.toUpperCase())}
                          aria-label={`Voucher number row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell className="w-[140px] min-w-[140px]">
                        <Input
                          className="h-8 text-xs sm:text-sm"
                          value={e.vehicleNo}
                          onChange={(ev) => setField(e.rowId, "vehicleNo", ev.target.value.toUpperCase())}
                          aria-label={`Vehicle number row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell className="w-[105px] min-w-[105px]">
                        <Input
                          className="h-8 text-xs sm:text-sm"
                          type="number"
                          step="0.01"
                          min="0"
                          value={e.liters}
                          onChange={(ev) => setField(e.rowId, "liters", ev.target.value)}
                          aria-label={`Liters row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell className="w-[155px] min-w-[155px]">
                        <Input
                          className="h-8 text-xs sm:text-sm"
                          type="date"
                          value={e.date}
                          onChange={(ev) => setField(e.rowId, "date", ev.target.value)}
                          aria-label={`Date row ${e.rowId}`}
                        />
                      </TableCell>
                      <TableCell className="w-[105px] min-w-[105px]"><StatusCell entry={e} /></TableCell>
                      <TableCell className="w-[48px] min-w-[48px]">
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

      {/* High-Resolution Receipt Preview Dialog */}
      <Dialog open={!!previewImage} onOpenChange={(o) => !o && setPreviewImage(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] flex flex-col p-4 sm:p-6">
          <DialogHeader className="flex flex-row items-center justify-between pb-2 border-b">
            <DialogTitle className="text-base font-semibold">
              {previewImage?.title || "Voucher Receipt"}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto flex items-center justify-center p-3 bg-muted/30 rounded-lg min-h-[350px]">
            {previewImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewImage.url}
                alt="Receipt preview"
                className="max-h-[75vh] w-auto max-w-full rounded object-contain shadow-md"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
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
