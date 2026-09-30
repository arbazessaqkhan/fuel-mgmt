"use client";

import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { OcrResult } from "@/lib/ocr/types";
import { AlertTriangle, Loader2, PencilLine, Save } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export interface VoucherFormValues {
  voucherNo: string;
  vehicleNo: string;
  liters: string;
  date: string;
}

const EMPTY: VoucherFormValues = { voucherNo: "", vehicleNo: "", liters: "", date: "" };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function fieldError(v: VoucherFormValues): Partial<Record<keyof VoucherFormValues, string>> {
  const errs: Partial<Record<keyof VoucherFormValues, string>> = {};
  if (!v.voucherNo.trim()) errs.voucherNo = "Voucher number is required";
  if (!v.vehicleNo.trim()) errs.vehicleNo = "Vehicle number is required";
  const l = parseFloat(v.liters);
  if (!v.liters.trim() || Number.isNaN(l) || l <= 0)
    errs.liters = "Liters must be a positive number";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) errs.date = "Pick a valid date";
  return errs;
}

function LowConfidenceNote({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
      <AlertTriangle className="h-3 w-3" /> Low OCR confidence — please verify this value
    </p>
  );
}

function FieldError({ show, text }: { show: boolean; text?: string }) {
  if (!show || !text) return null;
  return <p className="text-xs text-destructive">{text}</p>;
}

export function VoucherForm({
  ocr,
  imageUrl,
  onSubmit,
}: {
  ocr: OcrResult | null;
  imageUrl?: string | null;
  onSubmit: () => void; // called after a successful save; parent resets
}) {
  const [values, setValues] = useState<VoucherFormValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof VoucherFormValues, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Prefill when OCR results arrive
  const [prefilledFor, setPrefilledFor] = useState<OcrResult | null>(null);
  if (ocr && ocr !== prefilledFor) {
    setPrefilledFor(ocr);
    setValues({
      voucherNo: ocr.voucherNo.value ?? "",
      vehicleNo: ocr.vehicleNo.value ?? "",
      liters: ocr.liters.value != null ? String(ocr.liters.value) : "",
      date: ocr.date.value ?? "",
    });
    setErrors({});
    setFormError(null);
  }
  if (!ocr && prefilledFor) {
    setPrefilledFor(null);
    setValues(EMPTY);
    setErrors({});
    setFormError(null);
  }

  const lowConfidence = (conf: number) => conf > 0 && conf < 0.7;

  const set = (k: keyof VoucherFormValues, v: string) => {
    setValues((prev) => ({ ...prev, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
    setFormError(null);
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const errs = fieldError(values);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      // Attach the uploaded image (best effort — a failed upload must not
      // block saving the voucher itself).
      let attachedImage: string | null = null;
      if (imageUrl) {
        try {
          const blob = await fetch(imageUrl).then((r) => r.blob());
          const fd = new FormData();
          fd.append("file", blob, "voucher.jpg");
          const up = await fetch("/api/uploads", { method: "POST", body: fd });
          if (up.ok) {
            const ud = await up.json();
            attachedImage = ud.url ?? null;
          } else {
            toast.warning("Image could not be stored — saving voucher without it.");
          }
        } catch {
          toast.warning("Image could not be stored — saving voucher without it.");
        }
      }

      const res = await fetch("/api/vouchers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voucherNo: values.voucherNo.trim(),
          vehicleNo: values.vehicleNo.trim(),
          liters: parseFloat(values.liters),
          date: values.date,
          imageUrl: attachedImage,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 201) {
        toast.success("Voucher saved", {
          description: `${values.voucherNo} · ${values.vehicleNo} · ${values.liters} L`,
        });
        // Clear all inputs so the next voucher can be entered immediately.
        setValues({ ...EMPTY, date: todayIso() });
        setPrefilledFor(null);
        setErrors({});
        setFormError(null);
        onSubmit();
        return;
      }
      if (res.status === 409) {
        setFormError(data.error ?? "Duplicate voucher number.");
        return;
      }
      if (res.status === 400 && data.fieldErrors) {
        const fe = data.fieldErrors as Record<string, string[] | undefined>;
        setErrors({
          voucherNo: fe.voucherNo?.[0],
          vehicleNo: fe.vehicleNo?.[0],
          liters: fe.liters?.[0],
          date: fe.date?.[0],
        });
        return;
      }
      setFormError(data.error ?? "Something went wrong while saving.");
    } catch {
      setFormError("Network error — could not reach the server.");
    } finally {
      setSaving(false);
    }
  }

  // Manual entry: with no OCR result the form still renders with empty
  // fields so users can type a physical receipt directly — uploading an
  // image is never required.
  if (!ocr) {
    return (
      <form onSubmit={handleSave} className="space-y-4" noValidate>
        <div className="flex items-start gap-2.5 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <PencilLine className="mt-0.5 h-4 w-4 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Manual entry</p>
            <p className="text-xs text-muted-foreground">
              Type the details from a physical receipt and save. Or upload a
              voucher image to have the fields extracted automatically.
            </p>
          </div>
        </div>

        {formError && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Could not save</AlertTitle>
            <AlertDescription>{formError}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="voucherNo">Voucher No.</Label>
            <Input
              id="voucherNo"
              value={values.voucherNo}
              onChange={(e) => setValues((v) => ({ ...v, voucherNo: e.target.value.toUpperCase() }))}
              placeholder="e.g. FV-2026-0042"
              aria-invalid={!!errors.voucherNo}
            />
            <FieldError show={!!errors.voucherNo} text={errors.voucherNo} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="vehicleNo">Vehicle No.</Label>
            <Input
              id="vehicleNo"
              value={values.vehicleNo}
              onChange={(e) => setValues((v) => ({ ...v, vehicleNo: e.target.value.toUpperCase() }))}
              placeholder="e.g. ABC-1234"
              aria-invalid={!!errors.vehicleNo}
            />
            <FieldError show={!!errors.vehicleNo} text={errors.vehicleNo} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="liters">Liters</Label>
            <Input
              id="liters"
              type="number"
              step="0.01"
              min="0"
              value={values.liters}
              onChange={(e) => setValues((v) => ({ ...v, liters: e.target.value }))}
              placeholder="e.g. 45.5"
              aria-invalid={!!errors.liters}
            />
            <FieldError show={!!errors.liters} text={errors.liters} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={values.date}
              onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))}
              aria-invalid={!!errors.date}
            />
            <FieldError show={!!errors.date} text={errors.date} />
          </div>
        </div>

        <Button type="submit" disabled={saving} className="w-full sm:w-auto">
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {saving ? "Saving…" : "Save voucher"}
        </Button>
      </form>
    );
  }

  const unfound = [
    !values.voucherNo && "voucher number",
    !values.vehicleNo && "vehicle number",
    !values.liters && "liters",
    !values.date && "date",
  ].filter(Boolean) as string[];

  return (
    <form onSubmit={handleSave} className="space-y-4" noValidate>
      {unfound.length > 0 && (
        <Alert className="border-amber-500/50 text-amber-700">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some fields could not be read</AlertTitle>
          <AlertDescription>
            OCR could not confidently detect: {unfound.join(", ")}. Please fill them in
            manually.
          </AlertDescription>
        </Alert>
      )}

      {formError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not save</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="voucherNo">Voucher No.</Label>
          <Input
            id="voucherNo"
            value={values.voucherNo}
            onChange={(e) => set("voucherNo", e.target.value)}
            placeholder="e.g. FV-2026-0042"
            aria-invalid={!!errors.voucherNo}
          />
          {errors.voucherNo ? (
            <p className="text-xs text-destructive">{errors.voucherNo}</p>
          ) : (
            <LowConfidenceNote show={lowConfidence(ocr.voucherNo.confidence)} />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="vehicleNo">Vehicle No.</Label>
          <Input
            id="vehicleNo"
            value={values.vehicleNo}
            onChange={(e) => set("vehicleNo", e.target.value.toUpperCase())}
            placeholder="e.g. ABC-1234"
            aria-invalid={!!errors.vehicleNo}
          />
          {errors.vehicleNo ? (
            <p className="text-xs text-destructive">{errors.vehicleNo}</p>
          ) : (
            <LowConfidenceNote show={lowConfidence(ocr.vehicleNo.confidence)} />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="liters">Liters</Label>
          <Input
            id="liters"
            type="number"
            step="0.01"
            min="0.01"
            inputMode="decimal"
            value={values.liters}
            onChange={(e) => set("liters", e.target.value)}
            placeholder="e.g. 45.5"
            aria-invalid={!!errors.liters}
          />
          {errors.liters ? (
            <p className="text-xs text-destructive">{errors.liters}</p>
          ) : (
            <LowConfidenceNote show={lowConfidence(ocr.liters.confidence)} />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="date">Date</Label>
          <Input
            id="date"
            type="date"
            value={values.date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => set("date", e.target.value)}
            aria-invalid={!!errors.date}
          />
          {errors.date ? (
            <p className="text-xs text-destructive">{errors.date}</p>
          ) : (
            <LowConfidenceNote show={lowConfidence(ocr.date.confidence)} />
          )}
        </div>
      </div>

      <Button type="submit" disabled={saving} className="w-full sm:w-auto">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        {saving ? "Saving…" : "Save voucher"}
      </Button>
    </form>
  );
}
