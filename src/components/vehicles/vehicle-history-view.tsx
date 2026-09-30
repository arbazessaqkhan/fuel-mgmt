"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, CalendarRange, Droplets, FileSpreadsheet, FileText, Gauge, TrendingUp } from "lucide-react";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
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
  totalVouchers: number;
  months: Array<{ month: string; liters: number; vouchers: number }>;
  recent: Array<{
    id: string;
    voucherNo: string;
    liters: number;
    date: string;
    imageUrl?: string | null;
  }>;
}

function monthOptions(available: string[]) {
  // Group YYYY-MM by year: [{ year: 2026, months: [{value, label}] }]
  const byYear = new Map<number, Array<{ value: string; label: string }>>();
  for (const key of available) {
    const [y, m] = key.split("-").map(Number);
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push({
      value: key,
      label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
        month: "long",
        timeZone: "UTC",
      }),
    });
  }
  return Array.from(byYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, months]) => ({ year, months }));
}

const WINDOW_OPTIONS = [6, 12, 24];

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
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function shortPlate(key: string) {
  const [y, m] = key.split("-").map(Number);
  return `${new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} ${String(y).slice(2)}`;
}

function HistoryTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: { liters: number; vouchers: number; fullMonth: string } }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border bg-popover px-3.5 py-2.5 text-popover-foreground shadow-lg">
      <p className="text-sm font-semibold">{row.fullMonth}</p>
      <dl className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex justify-between gap-6">
          <dt>Liters</dt>
          <dd className="font-medium tabular-nums text-foreground">{fmt(row.liters)} L</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Vouchers</dt>
          <dd className="font-medium tabular-nums text-foreground">{row.vouchers}</dd>
        </div>
      </dl>
    </div>
  );
}

export function VehicleHistoryView({ vehicleNo }: { vehicleNo: string }) {
  // Custom date range (day precision): start + end date inputs, presets.
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);

  const load = useCallback(
    async (from: string | null, to: string | null) => {
      setLoading(true);
      setNotFound(false);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (from && to) {
          params.set("from", from);
          params.set("to", to);
        }
        const res = await fetch(
          `/api/vehicles/${encodeURIComponent(vehicleNo)}/history?${params}`
        );
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error();
        setData(await res.json());
      } catch {
        setError("Could not load vehicle history. Please refresh.");
      } finally {
        setLoading(false);
      }
    },
    [vehicleNo]
  );

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

  useEffect(() => {
    load(range.from, range.to);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, range]);

  // After the first load, default to the vehicle's full data span.
  useEffect(() => {
    if (data && range.from === null && range.to === null && data.availableMonths.length > 0) {
      setRange({
        from: `${data.availableMonths[0]}-01`,
        to: endOfMonthIso(data.availableMonths[data.availableMonths.length - 1]),
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

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

  const best = data
    ? data.months.reduce(
        (bestRow, m) => (m.liters > bestRow.liters ? m : bestRow),
        data.months[0] ?? { month: "—", liters: 0, vouchers: 0 }
      )
    : null;
  const avgPerFill =
    data && data.totalVouchers > 0 ? data.totalLiters / data.totalVouchers : 0;

  const chartRows =
    data?.months.map((m) => ({
      ...m,
      fullMonth: monthLabel(m.month),
      label: shortPlate(m.month),
    })) ?? [];

  const summaryCards = [
    {
      title: "Total Liters",
      icon: Droplets,
      value: data ? `${fmt(data.totalLiters)} L` : "—",
      sub: data ? `${monthLabel(data.fromMonth)} – ${monthLabel(data.toMonth)}` : undefined,
      accent: "from-blue-500/12 to-blue-500/4 text-blue-600 dark:text-blue-400",
    },
    {
      title: "Total Vouchers",
      icon: FileText,
      value: data ? String(data.totalVouchers) : "—",
      sub: data ? "fills recorded" : undefined,
      accent: "from-emerald-500/12 to-emerald-500/4 text-emerald-600 dark:text-emerald-400",
    },
    {
      title: "Avg per Fill",
      icon: Gauge,
      value: data ? `${fmt(avgPerFill)} L` : "—",
      sub: data && data.totalVouchers > 0 ? "per voucher" : undefined,
      accent: "from-violet-500/12 to-violet-500/4 text-violet-600 dark:text-violet-400",
    },
    {
      title: "Best Month",
      icon: TrendingUp,
      value: best && best.liters > 0 ? `${fmt(best.liters)} L` : "—",
      sub: best && best.liters > 0 ? monthLabel(best.month) : undefined,
      accent: "from-amber-500/12 to-amber-500/4 text-amber-600 dark:text-amber-400",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/"
            className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <h1 className="flex items-center gap-2.5 text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">
            <span className="rounded-lg bg-gradient-to-br from-primary to-chart-2 px-2.5 py-1 text-base font-bold text-primary-foreground shadow-sm">
              {vehicleNo}
            </span>
            <span className="sr-only sm:inline">vehicle history</span>
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Month-by-month fuel consumption over time.
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
              active={range.from === `${data?.availableMonths[0]}-01` && range.to === endOfMonthIso(data?.availableMonths[data.availableMonths.length - 1] ?? "")}
              onClick={() =>
                data &&
                applyRange(`${data.availableMonths[0]}-01`, endOfMonthIso(data.availableMonths[data.availableMonths.length - 1]))
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
            <Button asChild variant="outline" size="sm" className="gap-2">
              <a href={`/api/export/excel?vehicleNo=${encodeURIComponent(vehicleNo)}`} download>
                <FileSpreadsheet className="h-4 w-4" /> Export Vehicle to Excel
              </a>
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

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map(({ title, icon: Icon, value, sub, accent }) => (
          <Card key={title} className="card-premium border-border/60">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-[13px] font-medium text-muted-foreground">{title}</CardTitle>
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent}`}>
                <Icon className="h-5 w-5" />
              </span>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <>
                  <div className="truncate text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
                  {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Month-by-month chart + breakdown table */}
      <Card className="card-premium border-border/60">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarRange className="h-4 w-4 text-primary" /> Liters per month
          </CardTitle>
          <CardDescription>
            {data ? `${monthLabel(data.fromMonth)} – ${monthLabel(data.toMonth)}` : ""} — zero-activity months included.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : chartRows.length === 0 ? (
            <div className="flex h-72 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
              No history in this window.
            </div>
          ) : (
            <>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartRows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
                      maxBarSize={40}
                      animationDuration={600}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Compact breakdown table */}
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-2.5 font-medium">Month</th>
                      <th className="px-4 py-2.5 text-right font-medium">Liters</th>
                      <th className="px-4 py-2.5 text-right font-medium">Vouchers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartRows.map((row) => (
                      <tr key={row.month} className="border-b last:border-0">
                        <td className="px-4 py-2.5 font-medium">{row.fullMonth}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmt(row.liters)} L</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.vouchers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent vouchers */}
      <Card className="card-premium border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Recent vouchers</CardTitle>
          <CardDescription>Latest {data?.recent.length ?? 0} fills on record.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : !data || data.recent.length === 0 ? (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
              No vouchers recorded for this vehicle.
            </div>
          ) : (
            <ul className="divide-y rounded-xl border">
              {data.recent.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div>
                    <p className="inline-flex items-center gap-2 text-sm font-medium tabular-nums">
                      {v.voucherNo}
                      {v.imageUrl && (
                        <a
                          href={v.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="View voucher image"
                          className="block h-8 w-11 shrink-0 overflow-hidden rounded border bg-muted transition-shadow hover:ring-2 hover:ring-primary/50"
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
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.date).toLocaleDateString("en-US", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        timeZone: "UTC",
                      })}
                    </p>
                  </div>
                  <span className="rounded-full bg-accent px-3 py-1 text-sm font-semibold tabular-nums">
                    {fmt(v.liters)} L
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Recharts AreaChart kept for potential trend overlay in future work.
export const __unused = { AreaChart, Area };
