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
import { ArrowDown, ArrowUp, ArrowUpDown, Loader2, Pencil, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageIcon } from "lucide-react";

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

  // Debounce search input so results filter automatically as you type (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchInput !== search) {
        onSearch(searchInput);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search, onSearch]);

  // Keep local search input synced if external search prop changes
  useEffect(() => {
    setSearchInput(search);
  }, [search]);
  const [deleting, setDeleting] = useState<Voucher | null>(null);
  const [edit, setEdit] = useState<Voucher | null>(null);
  const [editValues, setEditValues] = useState({
    voucherNo: "", vehicleNo: "", liters: "", fuelType: "Diesel", date: "",
  });
  const [editImage, setEditImage] = useState<string | null>(null);
  const [editImageBusy, setEditImageBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const allOnPageSelected = vouchers.length > 0 && vouchers.every((v) => selected.has(v.id));
  const someOnPageSelected = vouchers.some((v) => selected.has(v.id));

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      if (vouchers.length > 0 && vouchers.every((v) => prev.has(v.id))) {
        const next = new Set(prev);
        vouchers.forEach((v) => next.delete(v.id));
        return next;
      }
      const next = new Set(prev);
      vouchers.forEach((v) => next.add(v.id));
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
    setBulkConfirm(false);
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const res = await fetch(`/api/vouchers/${selected.values().next().value}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error();
      toast.success(`${data.deleted ?? selected.size} voucher${selected.size === 1 ? "" : "s"} deleted`);
      clearSelection();
      onChanged();
    } catch {
      toast.error("Could not delete the selected vouchers");
    } finally {
      setBulkBusy(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const columns: Array<{ key: SortField | "actions" | "select"; label: string; sortable?: boolean }> = [
    { key: "select", label: "" },
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
      fuelType: v.fuelType === "Petrol" ? "Petrol" : "Diesel",
      date: new Date(v.date).toISOString().slice(0, 10),
    });
    setEditImage(v.imageUrl ?? null);
  }

  async function handleEditImageUpload(file: File) {
    setEditImageBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name || "voucher.jpg");
      const res = await fetch("/api/uploads", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error();
      setEditImage(data.url);
      toast.success("New image attached — save to keep it");
    } catch {
      toast.error("Could not upload the image");
    } finally {
      setEditImageBusy(false);
    }
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
          fuelType: editValues.fuelType === "Petrol" ? "Petrol" : "Diesel",
          date: editValues.date,
          imageUrl: editImage,
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
    <div className="flex h-full flex-col justify-between space-y-4">
      <div className="flex flex-1 flex-col space-y-3">
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
            <span className="text-sm font-medium">
              {selected.size} voucher{selected.size === 1 ? "" : "s"} selected
            </span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={clearSelection} disabled={bulkBusy}>
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBulkConfirm(true)}
                disabled={bulkBusy}
              >
                <Trash2 className="mr-1.5 h-4 w-4" /> Delete selected
              </Button>
            </div>
          </div>
        )}

        <div className="relative max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onSearch(searchInput);
              }
            }}
            placeholder="Search voucher or vehicle no…"
            className="pl-8 pr-8"
            aria-label="Search vouchers"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                onSearch("");
              }}
              className="absolute right-2.5 top-2.5 rounded-sm opacity-70 hover:opacity-100 transition-opacity focus:outline-none"
              aria-label="Clear search"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-[300px] w-full rounded-xl border border-border/70 overflow-hidden bg-card shadow-xs">
          <Table className="w-full">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((c) => (
                <TableHead key={c.key} className={c.key === "select" ? "w-10 pr-0" : undefined}>
                  {c.key === "select" ? (
                    <Checkbox
                      aria-label="Select all vouchers on this page"
                      checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : c.sortable ? (
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
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground select-none">
                  {search
                    ? `No vouchers match "${search}" in this month.`
                    : "No vouchers for this month yet. Scan one to get started."}
                </TableCell>
              </TableRow>
            ) : (
              vouchers.map((v) => (
                <TableRow
                  key={v.id}
                  className="cursor-pointer transition-colors hover:bg-muted/40 active:bg-muted/60"
                  onClick={() => router.push(`/vehicles/${encodeURIComponent(v.vehicleNo)}`)}
                >
                  <TableCell className="pr-0" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      aria-label={`Select voucher ${v.voucherNo}`}
                      checked={selected.has(v.id)}
                      onCheckedChange={() => toggleRow(v.id)}
                    />
                  </TableCell>
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
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-sm text-muted-foreground border-t border-border/40 mt-auto">
        <span>
          {total === 0
            ? "0 vouchers"
            : total === 1
            ? "1 voucher total"
            : `Showing ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total} vouchers`}
        </span>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => onPage(page - 1)}
            >
              Previous
            </Button>
            <span className="text-xs font-medium">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => onPage(page + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* Bulk delete confirmation */}
      <Dialog open={bulkConfirm} onOpenChange={(o) => !o && setBulkConfirm(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Delete {selected.size} voucher{selected.size === 1 ? "" : "s"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This permanently removes the {selected.size} selected voucher{selected.size === 1 ? "" : "s"}.
            This cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkConfirm(false)} disabled={bulkBusy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkBusy}>
              {bulkBusy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <p className="shrink-0 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {editError}
            </p>
          )}
          <div className="grid gap-3 overflow-y-auto -mr-2 pr-2 min-h-0">
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
                <Label htmlFor="edit-fuelType">Fuel type</Label>
                <Select
                  value={editValues.fuelType}
                  onValueChange={(v) => setEditValues((p) => ({ ...p, fuelType: v }))}
                >
                  <SelectTrigger id="edit-fuelType" aria-label="Fuel type">
                    <SelectValue placeholder="Select fuel type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Petrol">Petrol</SelectItem>
                    <SelectItem value="Diesel">Diesel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <div className="space-y-1.5">
              <Label>Voucher image</Label>
              {editImage ? (
                <a
                  href={editImage}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-fit overflow-hidden rounded-md border"
                  title="View full size"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={editImage}
                    alt="Voucher"
                    className="max-h-48 max-w-full object-contain"
                  />
                </a>
              ) : (
                <p className="flex items-center gap-1.5 rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                  <ImageIcon className="h-4 w-4" /> No image uploaded for this voucher.
                </p>
              )}
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="edit-image"
                  className="inline-flex h-9 cursor-pointer items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
                >
                  {editImageBusy
                    ? "Uploading…"
                    : editImage
                      ? "Replace image"
                      : "Upload image"}
                </Label>
                <Input
                  id="edit-image"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={editImageBusy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleEditImageUpload(f);
                    e.target.value = "";
                  }}
                />
                {editImage && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={editImageBusy}
                    onClick={() => setEditImage(null)}
                  >
                    Remove image
                  </Button>
                )}
              </div>
              {editImage !== (edit?.imageUrl ?? null) && (
                <p className="text-xs text-amber-600">
                  Image changed — click “Save changes” to keep it.
                </p>
              )}
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
