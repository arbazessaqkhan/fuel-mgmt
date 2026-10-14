"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Droplets, FileText, Truck, Car } from "lucide-react";

export interface Stats {
  year: number;
  month: number;
  totalLiters: number;
  voucherCount: number;
  mostActiveVehicle: string | null;
  vehicleBreakdown: Array<{ vehicleNo: string; liters: number; vouchers: number }>;
  fallback?: boolean;
  overallTotalLiters?: number;
  overallDieselLiters?: number;
  overallPetrolLiters?: number;
  overallVoucherCount?: number;
  totalVehiclesCount?: number;
  overallMostActiveVehicle?: string | null;
}

function formatLiters(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

const cardStyles = {
  fuel: "from-blue-500/15 to-blue-500/5 text-blue-600 dark:text-blue-400",
  vouchers: "from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400",
  vehicles: "from-purple-500/15 to-purple-500/5 text-purple-600 dark:text-purple-400",
  activeVehicle: "from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400",
};

export function MetricCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const totalLitersVal = stats
    ? formatLiters(stats.overallTotalLiters ?? stats.totalLiters ?? 0)
    : "—";
  const dieselLiters = stats
    ? formatLiters(stats.overallDieselLiters ?? stats.totalLiters ?? 0)
    : "0";
  const petrolLiters = stats
    ? formatLiters(stats.overallPetrolLiters ?? 0)
    : "0";

  const totalVouchersVal = stats
    ? String(stats.overallVoucherCount ?? stats.voucherCount ?? 0)
    : "—";

  const totalVehiclesVal = stats
    ? String(stats.totalVehiclesCount ?? (stats.vehicleBreakdown?.length ?? 0))
    : "—";

  const activeVehicleVal =
    stats?.overallMostActiveVehicle ?? stats?.mostActiveVehicle ?? "—";

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-4">
      {/* 1. Total Liters Card (with Petrol & Diesel separated) */}
      <Card className="card-premium border-border/60 flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
          <CardTitle className="text-[11px] sm:text-[13px] font-medium text-muted-foreground truncate">
            Total Fuel
          </CardTitle>
          <span
            className={`flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${cardStyles.fuel} shrink-0`}
          >
            <Droplets className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        </CardHeader>
        <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
          {loading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-6 sm:h-8 w-20 sm:w-28" />
              <Skeleton className="h-3 w-full" />
            </div>
          ) : (
            <>
              <div className="truncate text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight tabular-nums">
                {totalLitersVal}
                {stats && (
                  <span className="ml-0.5 sm:ml-1 text-xs sm:text-base font-medium text-muted-foreground">
                    L
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-col gap-0.5 border-t border-border/50 pt-1.5 text-[10px] sm:text-xs text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                    Diesel
                  </span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {dieselLiters} L
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Petrol
                  </span>
                  <span className="font-semibold text-foreground tabular-nums">
                    {petrolLiters} L
                  </span>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 2. Total Vouchers Processed (Overall) */}
      <Card className="card-premium border-border/60 flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
          <CardTitle className="text-[11px] sm:text-[13px] font-medium text-muted-foreground truncate">
            Vouchers
          </CardTitle>
          <span
            className={`flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${cardStyles.vouchers} shrink-0`}
          >
            <FileText className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        </CardHeader>
        <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
          {loading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-6 sm:h-8 w-16 sm:w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ) : (
            <>
              <div className="truncate text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight tabular-nums">
                {totalVouchersVal}
              </div>
              <div className="mt-2 border-t border-border/50 pt-1.5 text-[10px] sm:text-xs text-muted-foreground">
                <p className="truncate">All-time logged</p>
                <p className="hidden sm:block text-[10px] opacity-75">Processed vouchers</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Total Vehicles Card */}
      <Card className="card-premium border-border/60 flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
          <CardTitle className="text-[11px] sm:text-[13px] font-medium text-muted-foreground truncate">
            Vehicles
          </CardTitle>
          <span
            className={`flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${cardStyles.vehicles} shrink-0`}
          >
            <Car className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        </CardHeader>
        <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
          {loading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-6 sm:h-8 w-16 sm:w-24" />
              <Skeleton className="h-3 w-20" />
            </div>
          ) : (
            <>
              <div className="truncate text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight tabular-nums">
                {totalVehiclesVal}
              </div>
              <div className="mt-2 border-t border-border/50 pt-1.5 text-[10px] sm:text-xs text-muted-foreground">
                <p className="truncate">Active fleet</p>
                <p className="hidden sm:block text-[10px] opacity-75">Distinct units</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 4. Most Active Vehicle Card */}
      <Card className="card-premium border-border/60 flex flex-col justify-between">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 p-3 sm:p-5 pb-1 sm:pb-2">
          <CardTitle className="text-[11px] sm:text-[13px] font-medium text-muted-foreground truncate">
            Most Active
          </CardTitle>
          <span
            className={`flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-gradient-to-br ${cardStyles.activeVehicle} shrink-0`}
          >
            <Truck className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </span>
        </CardHeader>
        <CardContent className="p-3 sm:p-5 pt-0 sm:pt-0">
          {loading ? (
            <div className="space-y-2 py-1">
              <Skeleton className="h-6 sm:h-8 w-20 sm:w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          ) : (
            <>
              <div className="truncate text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight tabular-nums">
                {activeVehicleVal !== "—" ? (
                  <Link
                    href={`/vehicles/${encodeURIComponent(activeVehicleVal)}`}
                    className="underline-offset-4 transition-colors hover:text-primary hover:underline"
                    title="View vehicle history"
                  >
                    {activeVehicleVal}
                  </Link>
                ) : (
                  <span>{activeVehicleVal}</span>
                )}
              </div>
              <div className="mt-2 border-t border-border/50 pt-1.5 text-[10px] sm:text-xs text-muted-foreground">
                <p className="truncate">Top consumer</p>
                <p className="hidden sm:block text-[10px] opacity-75">By total liters</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
