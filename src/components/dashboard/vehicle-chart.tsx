"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { BarChart3 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Stats } from "./metric-cards";

const TOP_N = 8;

interface ChartRow {
  vehicle: string;
  liters: number;
  vouchers: number;
  share: number; // % of month total
}

function ChartTooltip({
  active,
  payload,
  totalLiters,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartRow }>;
  totalLiters: number;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-xl border bg-popover px-3.5 py-2.5 text-popover-foreground shadow-lg">
      <p className="text-sm font-semibold">{row.vehicle}</p>
      <dl className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
        <div className="flex justify-between gap-6">
          <dt>Liters</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(row.liters)} L
          </dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Vouchers</dt>
          <dd className="font-medium tabular-nums text-foreground">{row.vouchers}</dd>
        </div>
        <div className="flex justify-between gap-6">
          <dt>Share of month</dt>
          <dd className="font-medium tabular-nums text-foreground">
            {totalLiters > 0 ? `${Math.round((row.liters / totalLiters) * 100)}%` : "—"}
          </dd>
        </div>
      </dl>
      <p className="mt-2 border-t pt-1.5 text-[11px] text-muted-foreground">
        Click to view vehicle history
      </p>
    </div>
  );
}

export function VehicleChart({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  const { rows, totalLiters } = useMemo(() => {
    const breakdown = [...(stats?.vehicleBreakdown ?? [])].sort((a, b) => b.liters - a.liters);
    return {
      rows: breakdown.map((v) => ({
        vehicle: v.vehicleNo,
        liters: Math.round(v.liters * 100) / 100,
        vouchers: v.vouchers,
        share: 0,
      })),
      totalLiters: breakdown.reduce((s, v) => s + v.liters, 0),
    };
  }, [stats]);

  const visible = showAll ? rows : rows.slice(0, TOP_N);
  const isDimmed = (vehicle: string) => hovered !== null && hovered !== vehicle;

  return (
    <Card className="card-premium h-full border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <BarChart3 className="h-4 w-4 text-primary" /> Fuel consumption by vehicle
        </CardTitle>
        <CardDescription>
          Total liters per vehicle for the selected month — click a bar for history.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-72 w-full" />
        ) : rows.length === 0 ? (
          <div className="flex h-72 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
            <BarChart3 className="h-6 w-6 opacity-50" />
            No vehicle data for this month.
          </div>
        ) : (
          <>
            <div className="w-full overflow-x-auto">
              <div className="h-72 min-w-[420px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={visible}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  onMouseLeave={() => setHovered(null)}
                >
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="vehicle"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    interval={0}
                    tickFormatter={(v: string) => (v.length > 10 ? `${v.slice(0, 9)}…` : v)}
                    height={40}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11 }}
                    width={44}
                    tickFormatter={(v: number) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(v)}
                  />
                  <Tooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={<ChartTooltip totalLiters={totalLiters} />}
                  />
                  <Bar
                    dataKey="liters"
                    fill="url(#barGrad)"
                    radius={[6, 6, 2, 2]}
                    maxBarSize={56}
                    animationDuration={700}
                    onMouseEnter={(_, i) => setHovered(visible[i]?.vehicle ?? null)}
                    onClick={(entry: unknown) => {
                      const row = entry as ChartRow;
                      if (row?.vehicle) router.push(`/vehicles/${encodeURIComponent(row.vehicle)}`);
                    }}
                  >
                    {visible.map((row) => (
                      <Cell
                        key={row.vehicle}
                        className="cursor-pointer transition-opacity"
                        opacity={isDimmed(row.vehicle) ? 0.35 : 1}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            </div>
            {rows.length > TOP_N && (
              <button
                type="button"
                onClick={() => setShowAll((s) => !s)}
                className={cn(
                  "mt-2 text-xs font-medium text-primary underline-offset-4 hover:underline"
                )}
              >
                {showAll ? "Show top 8 only" : `Show all ${rows.length} vehicles`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
