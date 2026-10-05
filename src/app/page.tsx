"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCards, type Stats } from "@/components/dashboard/metric-cards";
import { VoucherTable } from "@/components/dashboard/voucher-table";
import { VehicleChart } from "@/components/dashboard/vehicle-chart";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import type { FuelVoucher as Voucher } from "@prisma/client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type SortField = "date" | "voucherNo" | "vehicleNo" | "liters";

export default function DashboardPage() {
  const now = new Date();
  // Stats default to the current month; when the current month has no vouchers
  // yet, the API falls back to the most recent month with data (flagged via
  // `fallback`), so the cards never show a misleading 0 on the 1st of a month.
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
  const [exporting, setExporting] = useState(false);
  const pageSize = 10;

  const handleExport = async () => {
    setExporting(true);
    const toastId = toast.loading("Generating Excel workbook with receipt images...");
    try {
      const res = await fetch("/api/export/excel");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `all-vouchers-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Excel download ready!", { id: toastId });
    } catch {
      toast.error("Export failed. Please try again.", { id: toastId });
    } finally {
      setExporting(false);
    }
  };

  // Restore cached data on mount for instant zero-skeleton rendering
  useEffect(() => {
    try {
      const cachedStats = sessionStorage.getItem("fuellog_cached_stats");
      if (cachedStats) {
        setStats(JSON.parse(cachedStats));
        setLoadingStats(false);
      }
      const cachedVouchers = sessionStorage.getItem("fuellog_cached_vouchers");
      const cachedTotal = sessionStorage.getItem("fuellog_cached_total");
      if (cachedVouchers && page === 1 && !search) {
        setVouchers(JSON.parse(cachedVouchers));
        if (cachedTotal) setTotal(Number(cachedTotal));
        setLoadingTable(false);
      }
    } catch {}
  }, []);

  const loadStats = useCallback(async (retry = true) => {
    try {
      const res = await fetch(`/api/stats?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setStats(data);
      setError(null);
      try {
        sessionStorage.setItem("fuellog_cached_stats", JSON.stringify(data));
      } catch {}
    } catch {
      if (retry) {
        // Auto-retry once in case database was in a cold-start wake-up
        setTimeout(() => loadStats(false), 1200);
        return;
      }
      setError("Could not load statistics.");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadVouchers = useCallback(async (retry = true) => {
    // Only show skeleton if we have no vouchers displayed yet or filtering
    if (vouchers.length === 0 || page !== 1 || search) {
      setLoadingTable(true);
    }
    try {
      // No year/month params: the table lists the FULL voucher history;
      // stats cards + chart stay scoped to the current month.
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortField,
        sortDir,
        _t: String(Date.now()),
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/vouchers?${params}`, { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setVouchers(data.items);
      setTotal(data.total);
      setError(null);
      if (page === 1 && !search) {
        try {
          sessionStorage.setItem("fuellog_cached_vouchers", JSON.stringify(data.items));
          sessionStorage.setItem("fuellog_cached_total", String(data.total));
        } catch {}
      }
    } catch {
      if (retry) {
        // Auto-retry once in case database was in a cold-start wake-up
        setTimeout(() => loadVouchers(false), 1200);
        return;
      }
      setError("Could not load vouchers.");
    } finally {
      setLoadingTable(false);
    }
  }, [page, search, sortField, sortDir, vouchers.length]);

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
    setError(null);
    try {
      sessionStorage.removeItem("fuellog_cached_stats");
      sessionStorage.removeItem("fuellog_cached_vouchers");
      sessionStorage.removeItem("fuellog_cached_total");
    } catch {}
    loadStats(false);
    loadVouchers(false);
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
        <Button
          variant="outline"
          className="gap-2"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          {exporting ? "Generating..." : "Export All to Excel"}
        </Button>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{error}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={refreshAll}
            className="h-7 text-xs border-destructive/40 hover:bg-destructive/15 text-destructive"
          >
            Retry
          </Button>
        </div>
      )}

      <MetricCards stats={stats} loading={loadingStats} />

      <div className="grid min-w-0 items-stretch gap-6 xl:grid-cols-5">
        <Card className="card-premium min-w-0 border-border/60 xl:col-span-3 flex flex-col h-full">
          <CardContent className="pt-6 flex flex-1 flex-col">
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
        <div className="min-w-0 xl:col-span-2 flex flex-col h-full">
          <VehicleChart stats={stats} loading={loadingStats} />
        </div>
      </div>
    </div>
  );
}
