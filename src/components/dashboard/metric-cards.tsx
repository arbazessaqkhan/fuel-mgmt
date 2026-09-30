"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { Droplets, FileText, Truck } from "lucide-react";

export interface Stats {
  year: number;
  month: number;
  totalLiters: number;
  voucherCount: number;
  mostActiveVehicle: string | null;
  vehicleBreakdown: Array<{ vehicleNo: string; liters: number; vouchers: number }>;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatLiters(n: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

const cardStyles = [
  "from-blue-500/12 to-blue-500/4 text-blue-600 dark:text-blue-400",
  "from-emerald-500/12 to-emerald-500/4 text-emerald-600 dark:text-emerald-400",
  "from-amber-500/12 to-amber-500/4 text-amber-600 dark:text-amber-400",
];

export function MetricCards({ stats, loading }: { stats: Stats | null; loading: boolean }) {
  const monthLabel = stats ? `${MONTHS[stats.month - 1]} ${stats.year}` : undefined;
  const cards = [
    {
      title: "Total Liters",
      icon: Droplets,
      value: stats ? formatLiters(stats.totalLiters) : "—",
      unit: stats ? "L" : undefined,
      sub: monthLabel ? `consumed in ${monthLabel}` : undefined,
      accent: cardStyles[0],
    },
    {
      title: "Vouchers Processed",
      icon: FileText,
      value: stats ? String(stats.voucherCount) : "—",
      unit: undefined,
      sub: monthLabel ? `in ${monthLabel}` : undefined,
      accent: cardStyles[1],
    },
    {
      title: "Most Active Vehicle",
      icon: Truck,
      value: stats?.mostActiveVehicle ?? "—",
      unit: undefined,
      sub: stats?.mostActiveVehicle
        ? `${formatLiters(stats.vehicleBreakdown[0]?.liters ?? 0)} L in ${monthLabel}`
        : undefined,
      accent: cardStyles[2],
      href: stats?.mostActiveVehicle
        ? `/vehicles/${encodeURIComponent(stats.mostActiveVehicle)}`
        : undefined,
    },
  ].map((card) => ({ ...card, href: "href" in card ? card.href : undefined }));

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {cards.map(({ title, icon: Icon, value, unit, sub, accent, href }) => (
        <Card key={title} className="card-premium border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-[13px] font-medium text-muted-foreground">{title}</CardTitle>
            <span
              className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${accent}`}
            >
              <Icon className="h-5 w-5" />
            </span>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-9 w-28" />
            ) : (
              <>
                <div className="truncate text-3xl font-semibold tracking-tight tabular-nums">
                  {href && value !== "—" ? (
                    <Link
                      href={href}
                      className="underline-offset-4 transition-colors hover:text-primary hover:underline"
                    >
                      {value}
                      {unit && (
                        <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>
                      )}
                    </Link>
                  ) : (
                    <>
                      {value}
                      {unit && (
                        <span className="ml-1 text-base font-medium text-muted-foreground">{unit}</span>
                      )}
                    </>
                  )}
                </div>
                {sub && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
