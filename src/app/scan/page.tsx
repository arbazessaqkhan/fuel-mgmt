"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getOcrService } from "@/lib/ocr/tesseract-adapter";
import type { OcrResult } from "@/lib/ocr/types";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { UploadZone } from "@/components/scanner/upload-zone";
import { VoucherForm } from "@/components/scanner/voucher-form";
import { BulkUpload } from "@/components/scanner/bulk-upload";
import { Layers, ScanLine, Camera, XCircle, RotateCcw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CameraScanner } from "@/components/scanner/camera-scanner";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function ScanPage() {
  const [activeTab, setActiveTab] = useState<string>("single");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const busy = progress != null;
  const previewRef = useRef<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleClear = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setPreviewUrl(null);
    setOcr(null);
    setProgress(null);
  }, []);

  const handleCancelOcr = useCallback(() => {
    handleClear();
    toast.info("Scanning stopped. You can upload a new voucher or enter fields manually.");
  }, [handleClear]);

  const handleFile = useCallback(async (file: File) => {
    // reset previous state
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreviewUrl(url);
    setOcr(null);
    setProgress(0);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      setProgress(20);
      let visionSucceeded = false;
      let result: OcrResult = {
        voucherNo: { value: null, confidence: 0 },
        vehicleNo: { value: null, confidence: 0 },
        liters: { value: null, confidence: 0 },
        date: { value: null, confidence: 0 },
        fullText: "",
        engineConfidence: 0,
      };

      // 1. Fast path: Direct AI Vision with Gemini (1.0s response)
      try {
        const fd = new FormData();
        fd.append("image", file);
        setProgress(50);
        const res = await fetch("/api/ocr/vision-correct", {
          method: "POST",
          body: fd,
          signal: abortController.signal,
        });
        if (res.ok) {
          const corr = (await res.json()) as Record<string, { value: string | number | null; confidence: number }>;
          result.voucherNo = (corr.voucherNo as any) ?? result.voucherNo;
          result.vehicleNo = (corr.vehicleNo as any) ?? result.vehicleNo;
          result.liters = (corr.liters as any) ?? result.liters;
          result.date = (corr.date as any) ?? result.date;
          result.engineConfidence = 0.95;
          visionSucceeded = true;
          setProgress(100);
          toast.success("Scan complete", {
            description: "Fields extracted with AI vision assistance — verify before saving.",
          });
          setOcr(result);
          return;
        }
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          return; // User cancelled
        }
        console.warn("Direct vision pass unavailable, falling back to local OCR:", err);
      }

      if (abortController.signal.aborted) return;

      // 2. Fallback path: If vision service was unavailable, run local Tesseract OCR
      if (!visionSucceeded) {
        toast.info("AI vision busy — using basic local scanner...", { duration: 4000 });
        const localResult = await getOcrService().recognize(file, (p) => {
          if (!abortController.signal.aborted) setProgress(p);
        });
        if (abortController.signal.aborted) return;
        result = localResult;
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
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-3xl">Scan Fuel Voucher</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Upload a scanned voucher — OCR runs in your browser and the extracted fields
          are pre-filled for you to verify before saving.
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="w-full">
          <TabsList className="grid grid-cols-3 w-full max-w-lg mx-auto sm:max-w-xl h-11 items-center rounded-full bg-muted/90 p-1 border border-border/60 text-muted-foreground shadow-xs">
            <TabsTrigger
              value="camera"
              className="rounded-full px-1 sm:px-4 py-2 text-[11px] sm:text-sm font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-1 sm:gap-1.5"
            >
              <Camera className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>Live <span className="hidden sm:inline">Scanner</span></span>
            </TabsTrigger>
            <TabsTrigger
              value="single"
              className="rounded-full px-1 sm:px-4 py-2 text-[11px] sm:text-sm font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-1 sm:gap-1.5"
            >
              <ScanLine className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>Single <span className="hidden sm:inline">voucher</span></span>
            </TabsTrigger>
            <TabsTrigger
              value="bulk"
              className="rounded-full px-1 sm:px-4 py-2 text-[11px] sm:text-sm font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm flex items-center justify-center gap-1 sm:gap-1.5"
            >
              <Layers className="h-3.5 w-3.5 sm:h-4 sm:w-4 shrink-0" />
              <span>Bulk <span className="hidden sm:inline">upload</span><span className="hidden md:inline"> (PDF)</span></span>
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="camera"
          forceMount
          className={cn("space-y-6", activeTab !== "camera" && "hidden")}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="card-premium border-border/60 overflow-hidden">
              <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="h-4 w-4" /> 1. Live camera viewfinder
                </CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  Point camera at the physical fuel voucher stub and snap photo to auto-extract fields.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6">
                {previewUrl ? (
                  <div className="space-y-4 p-3 sm:p-0">
                    <div className="relative overflow-hidden rounded-lg border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Scanned voucher preview"
                        className="mx-auto max-h-72 w-auto object-contain"
                      />
                      {progress != null && (
                        <div className="absolute inset-x-0 bottom-0 space-y-2 bg-background/95 p-3 backdrop-blur-sm border-t">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-medium text-foreground">Running AI extraction… {progress}%</span>
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              className="h-6 px-2.5 text-[11px] gap-1 bg-red-600 hover:bg-red-700 text-white font-medium shadow-xs"
                              onClick={handleCancelOcr}
                            >
                              <XCircle className="h-3 w-3" /> Stop / Cancel
                            </Button>
                          </div>
                          <Progress value={progress} />
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClear}
                      className="w-full h-11 rounded-xl gap-2 font-medium border-border/80 hover:border-primary/50 text-xs sm:text-sm"
                    >
                      <RotateCcw className="h-4 w-4 text-primary" />
                      Cancel &amp; Scan / Upload Brand New Voucher
                    </Button>
                  </div>
                ) : (
                  <CameraScanner
                    onCapture={handleFile}
                    onCancel={() => setActiveTab("single")}
                    disabled={busy}
                    active={activeTab === "camera"}
                  />
                )}
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
                <VoucherForm ocr={ocr} imageUrl={previewUrl} onSubmit={handleClear} onCancel={handleClear} />
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
        </TabsContent>

        <TabsContent
          value="single"
          forceMount
          className={cn("space-y-6", activeTab !== "single" && "hidden")}
        >
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
              onCancel={handleCancelOcr}
              onStartCamera={() => setActiveTab("camera")}
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
            <VoucherForm ocr={ocr} imageUrl={previewUrl} onSubmit={handleClear} />
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
        </TabsContent>

        <TabsContent
          value="bulk"
          forceMount
          className={cn(activeTab !== "bulk" && "hidden")}
        >
          <Card className="card-premium border-border/60">
            <CardHeader className="p-4 sm:p-6 pb-2 sm:pb-4">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" /> Bulk voucher extraction
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">
                Upload a PDF of scanned vouchers (or a photo of a ledger page). Every
                distinct voucher entry is extracted for you to review and edit before
                saving the batch.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-2 sm:p-6">
              <BulkUpload />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
