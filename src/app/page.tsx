"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MetricCards, type Stats } from "@/components/dashboard/metric-cards";
import { VoucherTable } from "@/components/dashboard/voucher-table";
import { VehicleChart } from "@/components/dashboard/vehicle-chart";
import { FileSpreadsheet, Loader2 } from "lucide-react";
import type { FuelVoucher as Voucher } from "@prisma/client";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";

type SortField = "date" | "voucherNo" | "vehicleNo" | "liters";

interface VouchersApiResponse {
  items: Voucher[];
  total: number;
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = useState(false);
  const pageSize = 10;

  // Cached Stats Query - Stored indefinitely and persisted across reloads until mutations invalidate it
  const {
    data: stats,
    isLoading: loadingStats,
    error: statsError,
    refetch: refetchStats,
  } = useQuery<Stats>({
    queryKey: ["stats"],
    queryFn: async () => {
      const res = await fetch("/api/stats");
      if (!res.ok) throw new Error("Could not load fleet statistics.");
      return res.json();
    },
  });

  // Cached Vouchers Query - Per-page/search/sort cached indefinitely
  const {
    data: vouchersData,
    isLoading: loadingVouchers,
    isPlaceholderData,
    error: vouchersError,
    refetch: refetchVouchers,
  } = useQuery<VouchersApiResponse>({
    queryKey: ["vouchers", { page, pageSize, search, sortField, sortDir }],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
        sortField,
        sortDir,
      });
      if (search) params.set("search", search);
      const res = await fetch(`/api/vouchers?${params}`);
      if (!res.ok) throw new Error("Could not load vouchers.");
      return res.json();
    },
    placeholderData: keepPreviousData, // Smooth pagination transitions without layout shifts
  });

  const vouchers = vouchersData?.items ?? [];
  const total = vouchersData?.total ?? 0;
  const error = statsError ? (statsError as Error).message : vouchersError ? (vouchersError as Error).message : null;

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

  const changeSort = (field: SortField) => {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "liters" || field === "date" ? "desc" : "asc");
    }
    setPage(1);
  };

  const changeSearch = (q: string) => {
    setSearch(q);
    setPage(1);
  };

  // Background sync on mount so dashboard always reflects any newly created vouchers
  useEffect(() => {
    refetchStats();
    refetchVouchers();
  }, [refetchStats, refetchVouchers]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ["vouchers"] });
    queryClient.invalidateQueries({ queryKey: ["stats"] });
    queryClient.removeQueries({ queryKey: ["vouchers"] });
    queryClient.removeQueries({ queryKey: ["stats"] });
    try {
      window.localStorage.removeItem("FUELLOG_QUERY_CACHE_V1");
    } catch {}
    refetchStats();
    refetchVouchers();
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

      <MetricCards stats={stats ?? null} loading={loadingStats && !stats} />

      <div className="grid min-w-0 items-start gap-6 xl:grid-cols-5">
        <Card className="card-premium min-w-0 border-border/60 xl:col-span-3">
          <CardContent className="p-4 sm:p-6">
            <VoucherTable
              vouchers={vouchers}
              total={total}
              page={page}
              pageSize={pageSize}
              search={search}
              sortField={sortField}
              sortDir={sortDir}
              loading={loadingVouchers && !vouchersData}
              onSearch={changeSearch}
              onSort={changeSort}
              onPage={setPage}
              onChanged={refreshAll}
            />
          </CardContent>
        </Card>
        <div className="min-w-0 xl:col-span-2">
          <VehicleChart stats={stats ?? null} loading={loadingStats && !stats} />
        </div>
      </div>
    </div>
  );
}
