"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCards, type Stats } from "@/components/dashboard/metric-cards";
import { VoucherTable } from "@/components/dashboard/voucher-table";
import { VehicleChart } from "@/components/dashboard/vehicle-chart";
import { FileSpreadsheet } from "lucide-react";
import type { FuelVoucher as Voucher } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";

type SortField = "date" | "voucherNo" | "vehicleNo" | "liters";

export default function DashboardPage() {
  const now = new Date();
  const [year] = useState(now.getUTCFullYear());
  const [month] = useState(now.getUTCMonth() + 1);
  const [stats, setStats] = useState<Stats | null>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingTable, setLoadingTable] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pageSize = 25;

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const res = await fetch(`/api/stats?year=${year}&month=${month}`);
      if (!res.ok) throw new Error();
      setStats(await res.json());
      setError(null);
    } catch {
      setError("Could not load statistics. Please refresh.");
    } finally {
      setLoadingStats(false);
    }
  }, [year, month]);

  const loadVouchers = useCallback(async () => {
    setLoadingTable(true);
    try {
      // No year/month params: the table lists the FULL voucher history;
      // stats cards + chart stay scoped to the current month.
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize), sortField, sortDir,
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/vouchers?${params}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setVouchers(data.items);
      setTotal(data.total);
      setError(null);
    } catch {
      setError("Could not load vouchers. Please refresh.");
    } finally {
      setLoadingTable(false);
    }
  }, [page, search, sortField, sortDir]);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { loadVouchers(); }, [loadVouchers]);

  const changeSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "liters" ? "desc" : "asc");
    }
    setPage(1);
  };

  const changeSearch = (q: string) => {
    setSearch(q);
    setPage(1);
  };

  const refreshAll = () => {
    loadStats();
    loadVouchers();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-3xl">
            Fleet Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Monthly fuel consumption across your fleet.
          </p>
        </div>
        <Button asChild variant="outline" className="gap-2">
          <a href="/api/export/excel" download>
            <FileSpreadsheet className="h-4 w-4" /> Export All to Excel
          </a>
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <MetricCards stats={stats} loading={loadingStats} />

      <div className="grid min-w-0 gap-6 xl:grid-cols-5">
        <Card className="card-premium min-w-0 border-border/60 xl:col-span-3">
          <CardContent className="pt-6">
            <VoucherTable
              vouchers={vouchers}
              total={total}
              page={page}
              pageSize={pageSize}
              search={search}
              sortField={sortField}
              sortDir={sortDir}
              loading={loadingTable}
              onSearch={changeSearch}
              onSort={changeSort}
              onPage={setPage}
              onChanged={refreshAll}
            />
          </CardContent>
        </Card>
        <div className="min-w-0 xl:col-span-2">
          <VehicleChart stats={stats} loading={loadingStats} />
        </div>
      </div>
    </div>
  );
}
