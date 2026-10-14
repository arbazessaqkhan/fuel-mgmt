"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  CalendarRange,
  Droplets,
  FileSpreadsheet,
  FileText,
  Fuel,
  Gauge,
  Loader2,
  TrendingUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface HistoryData {
  vehicleNo: string;
  fromMonth: string;
  toMonth: string;
  availableMonths: string[];
  totalLiters: number;
  dieselLiters?: number;
  petrolLiters?: number;
  primaryFuelType?: string;
  totalVouchers: number;
  months: Array<{ month: string; liters: number; vouchers: number }>;
  daily?: Array<{
    date: string;
    label: string;
    fullDate: string;
    liters: number;
    vouchers: number;
    fuelType: string;
  }>;
  vouchers?: Array<{
    id: string;
    voucherNo: string;
    vehicleNo: string;
    liters: number;
    fuelType: string;
    date: string;
    imageUrl?: string | null;
  }>;
  recent: Array<{
    id: string;
    voucherNo: string;
    liters: number;
    fuelType?: string;
    date: string;
    imageUrl?: string | null;
  }>;
}

const fmt = (n: number, digits = 2) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(n);

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function monthStartIso(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString().slice(0, 10);
}
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function PresetButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
        (active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}

function endOfMonthIso(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function monthLabel(key: string) {
  if (!key) return "";
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function formatDisplayDate(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function HistoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: {
      liters: number;
      vouchers: number;
      fullDate?: string;
      label?: string;
      fuelType?: string;
    };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border bg-popover px-3.5 py-2.5 text-popover-foreground shadow-lg">
      <p className="text-sm font-semibold">{row.fullDate || row.label}</p>
      <dl className="mt-1.5 space-y-1 text-xs text-muted-foreground">
        <div className="flex justify-between gap-6">
          <dt>Liters</dt>
          <dd className="font-medium tabular-nums text-foreground">{fmt(row.liters)} L</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Vouchers</dt>
          <dd className="font-medium tabular-nums text-foreground">{row.vouchers}</dd>
        </div>
        {row.fuelType && (
          <div className="flex justify-between gap-6">
            <dt>Type</dt>
            <dd className="font-medium text-foreground">{row.fuelType}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

export function VehicleHistoryView({ vehicleNo }: { vehicleNo: string }) {
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Cached Vehicle History Query
  const {
    data,
    isLoading,
    error: queryError,
  } = useQuery<HistoryData | null>({
    queryKey: ["vehicle", vehicleNo, { from: range.from, to: range.to }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range.from && range.to) {
        params.set("from", range.from);
        params.set("to", range.to);
      }
      const res = await fetch(
        `/api/vehicles/${encodeURIComponent(vehicleNo)}/history?${params}`
      );
      if (res.status === 404) {
        return null;
      }
      if (!res.ok) throw new Error("Could not load vehicle history.");
      return res.json();
    },
  });

  const notFound = !isLoading && data === null;
  const loading = isLoading && !data;
  const error = queryError ? (queryError as Error).message : null;

  const handleExport = async () => {
    setExporting(true);
    const toastId = toast.loading(`Generating Excel workbook for ${vehicleNo}...`);
    try {
      const res = await fetch(`/api/export/excel?vehicleNo=${encodeURIComponent(vehicleNo)}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vehicle-${vehicleNo}-vouchers-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel report ready!", { id: toastId });
    } catch {
      toast.error("Export failed. Please try again.", { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  const applyRange = useCallback(
    (from: string | null, to: string | null) => {
      if (from && to && from > to) {
        setRangeError("End date must be on or after the start date.");
        return;
      }
      setRangeError(null);
      setRange({ from, to });
    },
    []
  );

  // Default to the vehicle's full available span on first load
  useEffect(() => {
    if (data && range.from === null && range.to === null && data.availableMonths && data.availableMonths.length > 0) {
      setRange({
        from: `${data.availableMonths[0]}-01`,
        to: endOfMonthIso(data.availableMonths[data.availableMonths.length - 1]),
      });
    }
  }, [data, range.from, range.to]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Vehicle not found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No vouchers are recorded for <span className="font-medium text-foreground">{vehicleNo}</span>.
        </p>
        <Button asChild variant="outline" className="mt-6">
          <Link href="/"><ArrowLeft className="h-4 w-4" /> Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const avgPerFill =
    data && data.totalVouchers > 0
      ? Math.round((data.totalLiters / data.totalVouchers) * 100) / 100
      : 0;

  // Chart data: Date-wise daily points (if available) or monthly
  const chartData =
    data?.daily && data.daily.length > 0
      ? data.daily
      : data?.months.map((m) => ({
          date: m.month,
          label: monthLabel(m.month),
          fullDate: monthLabel(m.month),
          liters: m.liters,
          vouchers: m.vouchers,
          fuelType: data?.primaryFuelType || "Diesel",
        })) ?? [];

  // Vouchers table: date-wise list of individual fills
  const voucherList = data?.vouchers && data.vouchers.length > 0 ? data.vouchers : [];

  return (
    <div className="space-y-6">
      {/* Header section with vehicle number, fuel type badge, and date range filters */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">
              <span className="rounded-lg bg-gradient-to-br from-primary to-chart-2 px-3 py-1 text-lg font-bold text-primary-foreground shadow-xs">
                {vehicleNo}
              </span>
            </h1>
            {data?.primaryFuelType && (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider",
                  data.primaryFuelType === "Petrol"
                    ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                    : data.primaryFuelType === "Diesel"
                    ? "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30"
                    : "bg-purple-500/15 text-purple-700 dark:text-purple-400 border border-purple-500/30"
                )}
              >
                {data.primaryFuelType}
              </span>
            )}
          </div>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Complete date-wise fuel consumption and voucher history.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
          <div className="flex items-center gap-2">
            <div className="grid flex-1 gap-1 sm:w-44">
              <label htmlFor="range-from" className="text-[11px] font-medium text-muted-foreground">
                Start Date
              </label>
              <Input
                id="range-from"
                type="date"
                value={range.from ?? ""}
                max={range.to ?? undefined}
                onChange={(e) => applyRange(e.target.value || null, range.to)}
                aria-label="Start date"
              />
            </div>
            <span className="mt-4 text-muted-foreground">–</span>
            <div className="grid flex-1 gap-1 sm:w-44">
              <label htmlFor="range-to" className="text-[11px] font-medium text-muted-foreground">
                End Date
              </label>
              <Input
                id="range-to"
                type="date"
                value={range.to ?? ""}
                min={range.from ?? undefined}
                onChange={(e) => applyRange(range.from, e.target.value || null)}
                aria-label="End date"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 sm:mt-4">
            <PresetButton
              label="All time"
              active={
                Boolean(data?.availableMonths?.length) &&
                range.from === `${data?.availableMonths[0]}-01` &&
                range.to === endOfMonthIso(data?.availableMonths[data.availableMonths.length - 1] ?? "")
              }
              onClick={() =>
                data &&
                data.availableMonths.length > 0 &&
                applyRange(
                  `${data.availableMonths[0]}-01`,
                  endOfMonthIso(data.availableMonths[data.availableMonths.length - 1])
                )
              }
            />
            <PresetButton
              label="This month"
              active={range.from === monthStartIso() && range.to === todayIso()}
              onClick={() => applyRange(monthStartIso(), todayIso())}
            />
            <PresetButton
              label="Last 30 days"
              active={range.from === daysAgoIso(29) && range.to === todayIso()}
              onClick={() => applyRange(daysAgoIso(29), todayIso())}
            />
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleExport}
              disabled={exporting}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" />
              )}
              {exporting ? "Generating..." : "Export to Excel"}
            </Button>
          </div>
        </div>
      </div>

      {rangeError && (
        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {rangeError}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Responsive metric cards: 2 per row on mobile, 4 on desktop (just like dashboard) */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
        {/* Card 1: Total Liters with Diesel & Petrol separation */}
        <Card className="card-premium border-border/60 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
              Total Fuel
            </CardTitle>
            <span className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400">
              <Droplets className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <Skeleton className="h-7 sm:h-8 w-24 sm:w-32" />
            ) : (
              <>
                <div className="text-lg sm:text-2xl font-semibold tracking-tight tabular-nums">
                  {data ? `${fmt(data.totalLiters)} L` : "—"}
                </div>
                <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground flex flex-wrap gap-x-1.5 font-medium">
                  <span className="text-blue-600 dark:text-blue-400">
                    Diesel: {data ? fmt(data.dieselLiters ?? 0) : "0"} L
                  </span>
                  <span>·</span>
                  <span className="text-amber-600 dark:text-amber-400">
                    Petrol: {data ? fmt(data.petrolLiters ?? 0) : "0"} L
                  </span>
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 2: Total Vouchers */}
        <Card className="card-premium border-border/60 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
              Total Vouchers
            </CardTitle>
            <span className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400">
              <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <Skeleton className="h-7 sm:h-8 w-16 sm:w-20" />
            ) : (
              <>
                <div className="text-lg sm:text-2xl font-semibold tracking-tight tabular-nums">
                  {data ? String(data.totalVouchers) : "—"}
                </div>
                <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
                  Fills recorded
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 3: Fuel Type */}
        <Card className="card-premium border-border/60 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
              Fuel Type
            </CardTitle>
            <span className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-purple-500/15 to-purple-500/5 text-purple-600 dark:text-purple-400">
              <Fuel className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <Skeleton className="h-7 sm:h-8 w-20 sm:w-24" />
            ) : (
              <>
                <div className="text-lg sm:text-2xl font-semibold tracking-tight truncate">
                  {data?.primaryFuelType || "Diesel"}
                </div>
                <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
                  Engine specification
                </p>
              </>
            )}
          </CardContent>
        </Card>

        {/* Card 4: Average per Fill */}
        <Card className="card-premium border-border/60 flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-4 pb-1 sm:pb-2">
            <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground truncate">
              Avg per Fill
            </CardTitle>
            <span className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400">
              <Gauge className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </span>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0">
            {loading ? (
              <Skeleton className="h-7 sm:h-8 w-20 sm:w-24" />
            ) : (
              <>
                <div className="text-lg sm:text-2xl font-semibold tracking-tight tabular-nums">
                  {data ? `${fmt(avgPerFill)} L` : "—"}
                </div>
                <p className="mt-1 text-[11px] sm:text-xs text-muted-foreground">
                  Per voucher average
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Date-wise chart + date-wise breakdown table */}
      <Card className="card-premium border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" /> Fuel Fills (Date-Wise)
          </CardTitle>
          <CardDescription>
            {range.from && range.to
              ? `${formatDisplayDate(range.from)} – ${formatDisplayDate(range.to)}`
              : "Date-wise fuel consumption timeline"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartData.length === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              No fuel fill records found in this date window.
            </div>
          ) : (
            <>
              {/* Responsive Date-Wise Bar Chart */}
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="histBarGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.95} />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="label"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11 }}
                      width={44}
                      tickFormatter={(v: number) =>
                        new Intl.NumberFormat("en-US", { notation: "compact" }).format(v)
                      }
                    />
                    <Tooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<HistoryTooltip />} />
                    <Bar
                      dataKey="liters"
                      fill="url(#histBarGrad)"
                      radius={[6, 6, 2, 2]}
                      maxBarSize={44}
                      animationDuration={600}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Date-wise breakdown table */}
              <div className="overflow-x-auto rounded-xl border border-border/70">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-border/80 bg-slate-100/90 dark:bg-slate-800/90 text-left text-xs uppercase tracking-wide">
                      <th className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">Date</th>
                      <th className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">Voucher No.</th>
                      <th className="px-4 py-3 font-bold text-slate-800 dark:text-slate-100">Type</th>
                      <th className="px-4 py-3 text-right font-bold text-slate-800 dark:text-slate-100">Liters</th>
                    </tr>
                  </thead>
                  <tbody>
                    {voucherList.length > 0 ? (
                      voucherList.map((v) => (
                        <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                            {formatDisplayDate(v.date)}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="inline-flex items-center gap-2 font-medium">
                              {v.voucherNo}
                              {v.imageUrl && (
                                <a
                                  href={v.imageUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="View voucher image"
                                  className="block h-7 w-10 shrink-0 overflow-hidden rounded border bg-muted transition-shadow hover:ring-2 hover:ring-primary/50"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={v.imageUrl}
                                    alt={`Voucher ${v.voucherNo}`}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                  />
                                </a>
                              )}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide",
                                v.fuelType === "Petrol"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                                  : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30"
                              )}
                            >
                              {v.fuelType || "Diesel"}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                            {fmt(v.liters)} L
                          </td>
                        </tr>
                      ))
                    ) : chartData.length > 0 ? (
                      chartData.map((row) => (
                        <tr key={row.date} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                            {row.fullDate || row.label}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">—</td>
                          <td className="px-4 py-2.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tracking-wide",
                                row.fuelType === "Petrol"
                                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30"
                                  : "bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30"
                              )}
                            >
                              {row.fuelType}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                            {fmt(row.liters)} L
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                          No voucher records found in this date window.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
