"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { FuelVoucher as Voucher } from "@prisma/client";
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

type SortField = "date" | "voucherNo" | "vehicleNo" | "liters";

export interface VoucherTableProps {
  vouchers: Voucher[];
  total: number;
  page: number;
  pageSize: number;
  search: string;
  sortField: SortField;
  sortDir: "asc" | "desc";
  loading: boolean;
  onSearch: (q: string) => void;
  onSort: (field: SortField) => void;
  onPage: (p: number) => void;
  onChanged: () => void; // refetch after edit/delete
}

function fmtDate(d: string | Date) {
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric", timeZone: "UTC",
  });
}

export function VoucherTable(props: VoucherTableProps) {
  const router = useRouter();
  const {
    vouchers, total, page, pageSize, search, sortField, sortDir, loading,
    onSearch, onSort, onPage, onChanged,
  } = props;
  const [searchInput, setSearchInput] = useState(search);
  const [deleting, setDeleting] = useState<Voucher | null>(null);
  const [edit, setEdit] = useState<Voucher | null>(null);
  const [editValues, setEditValues] = useState({ voucherNo: "", vehicleNo: "", liters: "", date: "" });
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const columns: Array<{ key: SortField | "actions"; label: string; sortable?: boolean }> = [
    { key: "date", label: "Date", sortable: true },
    { key: "voucherNo", label: "Voucher No.", sortable: true },
    { key: "vehicleNo", label: "Vehicle No.", sortable: true },
    { key: "liters", label: "Liters", sortable: true },
    { key: "actions", label: "" },
  ];

  function SortIcon({ field }: { field: SortField }) {
    if (field !== sortField) return <ArrowUpDown className="ml-1 h-3.5 w-3.5 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="ml-1 h-3.5 w-3.5" />
      : <ArrowDown className="ml-1 h-3.5 w-3.5" />;
  }

  async function handleDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/vouchers/${deleting.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`Voucher ${deleting.voucherNo} deleted`);
      setDeleting(null);
      onChanged();
    } catch {
      toast.error("Could not delete the voucher");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(v: Voucher) {
    setEdit(v);
    setEditError(null);
    setEditValues({
      voucherNo: v.voucherNo,
      vehicleNo: v.vehicleNo,
      liters: String(v.liters),
      date: new Date(v.date).toISOString().slice(0, 10),
    });
  }

  async function handleEditSave() {
    if (!edit) return;
    setBusy(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/vouchers/${edit.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          voucherNo: editValues.voucherNo.trim(),
          vehicleNo: editValues.vehicleNo.trim(),
          liters: parseFloat(editValues.liters),
          date: editValues.date,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setEditError(data.error ?? "Could not update the voucher.");
        return;
      }
      toast.success("Voucher updated");
      setEdit(null);
      onChanged();
    } catch {
      setEditError("Network error — could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSearch(searchInput)}
          onBlur={() => searchInput !== search && onSearch(searchInput)}
          placeholder="Search voucher or vehicle no…"
          className="pl-8"
          aria-label="Search vouchers"
        />
      </div>

      <div className="max-w-full overflow-x-auto rounded-lg border [&_table]:min-w-[420px] [&_table]:max-w-none">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key}>
                  {c.sortable ? (
                    <button
                      className="flex items-center font-medium hover:text-foreground"
                      onClick={() => onSort(c.key as SortField)}
                    >
                      {c.label}
                      <SortIcon field={c.key as SortField} />
                    </button>
                  ) : (
                    c.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {columns.map((c) => (
                    <TableCell key={c.key}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : vouchers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  {search
                    ? `No vouchers match "${search}" in this month.`
                    : "No vouchers for this month yet. Scan one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              vouchers.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer transition-colors hover:bg-muted/60"
                  onClick={() => router.push(`/vehicles/${encodeURIComponent(v.vehicleNo)}`)}
                >
                  <TableCell className="whitespace-nowrap">{fmtDate(v.date)}</TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      {v.voucherNo}
                      {v.imageUrl && (
                        <a
                          href={v.imageUrl}
                          target="_blank"
                          rel="noreferrer"
                          title="View voucher image"
                          onClick={(e) => e.stopPropagation()}
                          className="block h-9 w-12 shrink-0 overflow-hidden rounded border bg-muted transition-shadow hover:ring-2 hover:ring-primary/50"
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
                  </TableCell>
                  <TableCell className="font-medium">{v.vehicleNo}</TableCell>
                  <TableCell className="tabular-nums">{v.liters.toFixed(2)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${v.voucherNo}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(v);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        aria-label={`Delete ${v.voucherNo}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleting(v);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>
          {total > 0
            ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
            : "0 vouchers"}
        </span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>
            Previous
          </Button>
          <span>Page {page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages || loading} onClick={() => onPage(page + 1)}>
            Next
          </Button>
        </div>
      </div>

      {/* Delete confirmation */}
      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete voucher?</DialogTitle>
          </DialogHeader>
          {deleting && (
            <p className="text-sm text-muted-foreground">
              This permanently removes voucher <span className="font-medium text-foreground">{deleting.voucherNo}</span>{" "}
              ({deleting.vehicleNo}, {deleting.liters.toFixed(2)} L). This cannot be undone.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit voucher</DialogTitle>
          </DialogHeader>
          {editError && (
            <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {editError}
            </p>
          )}
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-voucherNo">Voucher No.</Label>
              <Input
                id="edit-voucherNo"
                value={editValues.voucherNo}
                onChange={(e) => setEditValues((v) => ({ ...v, voucherNo: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-vehicleNo">Vehicle No.</Label>
              <Input
                id="edit-vehicleNo"
                value={editValues.vehicleNo}
                onChange={(e) => setEditValues((v) => ({ ...v, vehicleNo: e.target.value.toUpperCase() }))}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-liters">Liters</Label>
                <Input
                  id="edit-liters"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editValues.liters}
                  onChange={(e) => setEditValues((v) => ({ ...v, liters: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-date">Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editValues.date}
                  onChange={(e) => setEditValues((v) => ({ ...v, date: e.target.value }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
