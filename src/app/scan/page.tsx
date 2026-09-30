"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOcrService } from "@/lib/ocr/tesseract-adapter";
import type { OcrResult } from "@/lib/ocr/types";
import { ScanLine } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { UploadZone } from "@/components/scanner/upload-zone";
import { VoucherForm } from "@/components/scanner/voucher-form";

export default function ScanPage() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const busy = progress != null;
  const previewRef = useRef<string | null>(null);

  const handleFile = useCallback(async (file: File) => {
    // reset previous state
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreviewUrl(url);
    setOcr(null);
    setProgress(0);

    try {
      const result = await getOcrService().recognize(file, (p) => setProgress(p));
      // The server-side vision model reads handwriting far more accurately
      // than browser regex OCR (which was confidently wrong on real vouchers:
      // "210" instead of 40 litres, half a plate instead of the full one), so
      // ALWAYS ask it for a second opinion and let its per-field values win.
      {
        setProgress(100);
        try {
          const fd = new FormData();
          fd.append("image", file);
          const res = await fetch("/api/ocr/vision-correct", { method: "POST", body: fd });
          if (res.ok) {
            const corr = (await res.json()) as Record<string, { value: string | number | null; confidence: number }>;            const pick = (
              local: { value: string | number | null; confidence: number },
              remote: { value: string | number | null; confidence: number } | undefined
            ): typeof local =>
              // The vision model reads handwriting far more accurately than
              // regex OCR — local passes were confidently wrong on real
              // vouchers (e.g. 210 for 40 litres). Defer to the vision read
              // whenever it produced a value; keep local only for fields the
              // vision model could not read.
              remote && remote.value != null ? remote : local;
            result.voucherNo = pick(result.voucherNo, corr.voucherNo) as typeof result.voucherNo;
            result.vehicleNo = pick(result.vehicleNo, corr.vehicleNo) as typeof result.vehicleNo;
            result.liters = pick(result.liters, corr.liters) as typeof result.liters;
            result.date = pick(result.date, corr.date) as typeof result.date;
            if ([result.voucherNo, result.vehicleNo, result.liters, result.date].every((f) => f.value != null)) {
              toast.success("Scan complete", {
                description: "Fields extracted with AI vision assistance — verify before saving.",
              });
              setOcr(result);
              return;
            }
          }
          // corrector unavailable/failed: fall through to local-only result,
          // but tell the user the AI read failed so they double-check fields.
          if (!res.ok) {
            console.warn("vision-correct unavailable:", res.status);
            toast.warning("AI verification unavailable", {
              description:
                "The AI vision service is busy right now, so the values below come from the basic scanner and may be inaccurate. Please double-check every field before saving.",
              duration: 12000,
            });
          }
        } catch {
          // non-fatal — show whatever the local pass produced
        }
      }
      if (result.engineConfidence < 0.15 && !result.voucherNo.value && !result.liters.value) {
        toast.error("Could not read the voucher", {
          description:
            "The image may be too blurry or empty. Try a clearer scan, or enter the details manually below.",
        });
      } else {
        toast.success("Scan complete", {
          description: "Review the extracted values below before saving.",
        });
      }
      setOcr(result);
    } catch {
      toast.error("OCR failed", {
        description:
          "Something went wrong while processing the image. You can still enter the voucher details manually.",
      });
      // Provide an empty result so manual entry is available
      setOcr({
        voucherNo: { value: null, confidence: 0 },
        vehicleNo: { value: null, confidence: 0 },
        liters: { value: null, confidence: 0 },
        date: { value: null, confidence: 0 },
        fullText: "",
        engineConfidence: 0,
      });
    } finally {
      setProgress(null);
    }
  }, []);

  const handleClear = useCallback(() => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
    setOcr(null);
    setProgress(null);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-3xl">Scan Fuel Voucher</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Upload a scanned voucher — OCR runs in your browser and the extracted fields
          are pre-filled for you to verify before saving.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="card-premium border-border/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="h-4 w-4" /> 1. Upload voucher image
            </CardTitle>
            <CardDescription>JPG, PNG or WebP — processed locally, up to 10 MB.</CardDescription>
          </CardHeader>
          <CardContent>
            <UploadZone
              onFileSelected={handleFile}
              onClear={handleClear}
              previewUrl={previewUrl}
              progress={progress}
              disabled={busy}
            />
          </CardContent>
        </Card>

        <Card className="card-premium border-border/60">
          <CardHeader>
            <CardTitle className="text-base">2. Verify &amp; save</CardTitle>
            <CardDescription>
              Correct any misread values, then save to the fuel log.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <VoucherForm ocr={ocr} onSubmit={() => {/* keep image so user can rescan similar */}} />
            {ocr && (
              <>
                <Separator className="my-4" />
                <details className="text-xs text-muted-foreground">
                  <summary className="cursor-pointer select-none">Raw OCR text</summary>
                  <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2">
                    {ocr.fullText || "(no text recognized)"}
                  </pre>
                </details>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
