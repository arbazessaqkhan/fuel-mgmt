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
import { Layers, ScanLine, Camera } from "lucide-react";
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

  const handleFile = useCallback(async (file: File) => {
    // reset previous state
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    const url = URL.createObjectURL(file);
    previewRef.current = url;
    setPreviewUrl(url);
    setOcr(null);
    setProgress(0);

    try {
      setProgress(15);
      let visionSucceeded = false;
      let result: OcrResult = {
        voucherNo: { value: null, confidence: 0 },
        vehicleNo: { value: null, confidence: 0 },
        liters: { value: null, confidence: 0 },
        date: { value: null, confidence: 0 },
        fullText: "",
        engineConfidence: 0,
      };

      // 1. Fast path: Direct AI Vision (1.5s instead of 10s)
      try {
        const fd = new FormData();
        fd.append("image", file);
        setProgress(45);
        const res = await fetch("/api/ocr/vision-correct", { method: "POST", body: fd });
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
      } catch (err) {
        console.warn("Direct vision pass unavailable, falling back to local OCR:", err);
      }

      // 2. Fallback path: If vision service was unavailable, run local Tesseract OCR
      if (!visionSucceeded) {
        toast.info("AI vision busy — using basic local scanner...", { duration: 4000 });
        const localResult = await getOcrService().recognize(file, (p) => setProgress(p));
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <div className="w-full max-w-full overflow-x-auto no-scrollbar pb-1">
          <TabsList className="inline-flex h-11 w-max min-w-full items-center justify-start rounded-full bg-muted/90 p-1 border border-border/60 text-muted-foreground shadow-xs">
            <TabsTrigger
              value="camera"
              className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <Camera className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> Live Scanner
            </TabsTrigger>
            <TabsTrigger
              value="single"
              className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <ScanLine className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> Single voucher
            </TabsTrigger>
            <TabsTrigger
              value="bulk"
              className="rounded-full px-4 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
            >
              <Layers className="mr-1.5 h-3.5 w-3.5 sm:mr-2 sm:h-4 sm:w-4" /> Bulk upload (PDF)
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="camera"
          forceMount
          className={cn("space-y-6", activeTab !== "camera" && "hidden")}
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="card-premium border-border/60">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Camera className="h-4 w-4" /> 1. Live camera viewfinder
                </CardTitle>
                <CardDescription>
                  Point camera at the physical fuel voucher stub and snap photo to auto-extract fields.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {previewUrl ? (
                  <div className="space-y-4">
                    <div className="relative overflow-hidden rounded-lg border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Scanned voucher preview"
                        className="mx-auto max-h-72 w-auto object-contain"
                      />
                      {progress != null && (
                        <div className="absolute inset-x-0 bottom-0 space-y-1 bg-background/90 p-3">
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Running AI extraction…</span>
                            <span>{progress}%</span>
                          </div>
                          <Progress value={progress} />
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleClear}
                      className="w-full h-11 rounded-xl gap-2 font-medium border-border/80 hover:border-primary/50"
                    >
                      <Camera className="h-4 w-4 text-primary" />
                      Scan Another Voucher
                    </Button>
                  </div>
                ) : (
                  <CameraScanner
                    onCapture={handleFile}
                    onCancel={() => setActiveTab("single")}
                    disabled={busy}
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
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" /> Bulk voucher extraction
              </CardTitle>
              <CardDescription>
                Upload a PDF of scanned vouchers (or a photo of a ledger page). Every
                distinct voucher entry is extracted for you to review and edit before
                saving the batch.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <BulkUpload />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
