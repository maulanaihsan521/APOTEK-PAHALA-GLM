"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, fmtDate, num, rp } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyHint, ErrorBox } from "@/components/views/dashboard";
import { toast } from "sonner";
import type { UserInfo } from "@/components/login-view";
import {
  Plus, Search, Download, Upload, Pencil, Trash2, ChevronLeft, ChevronRight,
  FileSpreadsheet, FileDown, Loader2, ArrowUpDown, ShoppingBasket,
} from "lucide-react";

interface Medicine { id: string; code: string; name: string; basePrice: number; unit: string }
interface SaleRow {
  id: string; date: string; mutation: string; medicineName: string; medicineCode: string;
  quantity: number; unitPrice: number; totalPrice: number; source: string;
}
interface SalesResp {
  rows: SaleRow[]; total: number; page: number; pageSize: number;
  summary: { units: number; revenue: number };
}

export function PenjualanView({ user }: { user: UserInfo }) {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [resp, setResp] = useState<SalesResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [medFilter, setMedFilter] = useState("all");
  const [mutation, setMutation] = useState("all");
  const [sort, setSort] = useState("date");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [deleting, setDeleting] = useState<SaleRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    api<{ medicines: Medicine[] }>("/api/medicines").then((m) => setMedicines(m.medicines)).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, dir });
    if (search) params.set("search", search);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (medFilter !== "all") params.set("medicineId", medFilter);
    if (mutation !== "all") params.set("mutation", mutation);
    api<SalesResp>(`/api/sales?${params}`)
      .then((r) => setResp(r))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [page, pageSize, sort, dir, search, from, to, medFilter, mutation]);

  useEffect(() => { load(); }, [load]);

  function toggleSort(key: string) {
    if (sort === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSort(key); setDir("desc"); }
  }

  const totalPages = resp ? Math.max(1, Math.ceil(resp.total / pageSize)) : 1;
  const startIdx = resp ? (resp.page - 1) * pageSize + 1 : 0;
  const endIdx = resp ? Math.min(resp.total, resp.page * pageSize) : 0;

  function exportUrl(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (medFilter !== "all") params.set("medicineId", medFilter);
    return `/api/sales/export?${params}`;
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Cari nama obat atau kode…" className="pl-9" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Input type="date" className="w-[140px]" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="Tanggal awal" />
            <Input type="date" className="w-[140px]" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Tanggal akhir" />
            <Select value={medFilter} onValueChange={(v) => { setMedFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[170px]"><SelectValue placeholder="Semua obat" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Obat</SelectItem>
                {medicines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={mutation} onValueChange={(v) => { setMutation(v); setPage(1); }}>
              <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua Mutasi</SelectItem>
                <SelectItem value="P">Penjualan (P)</SelectItem>
                <SelectItem value="R">Retur (R)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {user.role === "Admin" || user.role === "Petugas" ? (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
                <Plus className="size-4" /> Tambah Transaksi
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setImportOpen(true)}>
              <Upload className="size-4" /> Impor
            </Button>
            <Button variant="outline" asChild>
              <a href={exportUrl("csv")} download><FileDown className="size-4" /> Ekspor CSV</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={exportUrl("xlsx")} download><FileSpreadsheet className="size-4" /> Ekspor Excel</a>
            </Button>
            {resp && (
              <span className="text-xs text-muted-foreground ml-auto">
                Menampilkan {num(startIdx)}–{num(endIdx)} dari {num(resp.total)} data · {num(resp.summary.units)} unit · {rp(resp.summary.revenue)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Tabel */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : error ? (
            <div className="p-4"><ErrorBox message={error} onRetry={load} /></div>
          ) : !resp || resp.rows.length === 0 ? (
            <div className="p-8"><EmptyHint text="Tidak ada transaksi yang cocok dengan filter. Ubah filter atau tambahkan transaksi baru." /></div>
          ) : (
            <>
              {/* Kartu mobile */}
              <div className="lg:hidden divide-y">
                {resp.rows.map((r) => (
                  <div key={r.id} className="p-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] truncate">{r.medicineName}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(r.date)} · {r.medicineCode}</p>
                      </div>
                      <Badge variant="outline" className={`${r.mutation === "R" ? "border-danger/40 text-danger" : "border-primary/40 text-primary"} shrink-0`}>
                        {r.mutation === "R" ? "Retur" : "Penjualan"}
                      </Badge>
                    </div>
                    <div className="flex items-center text-sm">
                      <span className={r.quantity < 0 ? "text-danger font-medium" : "font-medium"}>{num(r.quantity)} unit × {rp(r.unitPrice)}</span>
                      <span className="ml-auto font-bold">{rp(r.totalPrice)}</span>
                      <button className="rounded-lg p-1.5 ml-2 hover:bg-muted text-muted-foreground" aria-label="Ubah transaksi" onClick={() => { setEditing(r); setFormOpen(true); }}>
                        <Pencil className="size-4" />
                      </button>
                      {user.role === "Admin" && (
                        <button className="rounded-lg p-1.5 hover:bg-danger/10 text-muted-foreground hover:text-danger" aria-label="Hapus transaksi" onClick={() => setDeleting(r)}>
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Tabel desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b bg-muted/40">
                    <th className="text-left font-medium px-4 py-2.5">Tanggal</th>
                    <th className="text-left font-medium px-4 py-2.5">Nama Obat</th>
                    <th className="text-right font-medium px-4 py-2.5 cursor-pointer select-none" onClick={() => toggleSort("quantity")}>
                      <span className="inline-flex items-center gap-1">Jumlah <ArrowUpDown className="size-3" /></span>
                    </th>
                    <th className="text-right font-medium px-4 py-2.5 cursor-pointer select-none" onClick={() => toggleSort("unitPrice")}>
                      <span className="inline-flex items-center gap-1">Harga Satuan <ArrowUpDown className="size-3" /></span>
                    </th>
                    <th className="text-right font-medium px-4 py-2.5 cursor-pointer select-none" onClick={() => toggleSort("totalPrice")}>
                      <span className="inline-flex items-center gap-1">Total Harga <ArrowUpDown className="size-3" /></span>
                    </th>
                    <th className="text-center font-medium px-4 py-2.5">Mutasi</th>
                    <th className="text-center font-medium px-4 py-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {resp.rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 whitespace-nowrap">{fmtDate(r.date)}</td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium">{r.medicineName}</div>
                        <div className="text-xs text-muted-foreground">{r.medicineCode} · {r.source}</div>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-medium ${r.quantity < 0 ? "text-danger" : ""}`}>{num(r.quantity)}</td>
                      <td className="px-4 py-2.5 text-right">{rp(r.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{rp(r.totalPrice)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Badge variant="outline" className={r.mutation === "R" ? "border-danger/40 text-danger" : "border-primary/40 text-primary"}>
                          {r.mutation === "R" ? "Retur" : "Penjualan"}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1">
                          <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                            aria-label="Ubah transaksi" onClick={() => { setEditing(r); setFormOpen(true); }}>
                            <Pencil className="size-4" />
                          </button>
                          {user.role === "Admin" && (
                            <button className="rounded-lg p-1.5 hover:bg-danger/10 text-muted-foreground hover:text-danger"
                              aria-label="Hapus transaksi" onClick={() => setDeleting(r)}>
                              <Trash2 className="size-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </>
          )}
          {/* Pagination */}
          {resp && resp.total > pageSize && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <span className="text-xs text-muted-foreground">Halaman {resp.page} dari {totalPages}</span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="size-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Sebelumnya">
                  <ChevronLeft className="size-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
                  if (p > totalPages) return null;
                  return (
                    <Button key={p} variant={p === page ? "default" : "outline"} size="icon" className="size-8 text-xs" onClick={() => setPage(p)}>
                      {p}
                    </Button>
                  );
                })}
                <Button variant="outline" size="icon" className="size-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} aria-label="Berikutnya">
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Form tambah/ubah */}
      <SaleForm
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        medicines={medicines}
        editing={editing}
        onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
      />

      {/* Konfirmasi hapus */}
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus transaksi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${fmtDate(deleting.date)} — ${deleting.medicineName} (${num(deleting.quantity)} unit, ${rp(deleting.totalPrice)}). Tindakan ini tidak dapat dibatalkan.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async () => {
                if (!deleting) return;
                try {
                  await api(`/api/sales/${deleting.id}`, { method: "DELETE" });
                  toast.success("Transaksi berhasil dihapus.");
                  load();
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setDeleting(null);
                }
              }}
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ImportWizard open={importOpen} onOpenChange={setImportOpen} onDone={load} />
    </div>
  );
}

function SaleForm({ open, onOpenChange, medicines, editing, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; medicines: Medicine[];
  editing: SaleRow | null; onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [date, setDate] = useState("");
  const [medId, setMedId] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [mutation, setMutation] = useState("P");
  const [saving, setSaving] = useState(false);
  const [fieldErr, setFieldErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setFieldErr(null);
      if (editing) {
        setDate(editing.date.slice(0, 10));
        setMedId(medicines.find((m) => m.name === editing.medicineName)?.id ?? "");
        setQty(String(Math.abs(editing.quantity)));
        setPrice(String(editing.unitPrice));
        setMutation(editing.mutation);
      } else {
        setDate(new Date().toISOString().slice(0, 10));
        setMedId(medicines[0]?.id ?? "");
        setQty("");
        setPrice(medicines[0]?.basePrice ? String(medicines[0].basePrice) : "");
        setMutation("P");
      }
    }
  }, [open, editing, medicines]);

  function onMedChange(v: string) {
    setMedId(v);
    const m = medicines.find((x) => x.id === v);
    if (m && !isEdit) setPrice(String(m.basePrice));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErr(null);
    const qtyNum = Number(qty);
    const priceNum = Number(price);
    if (!date) return setFieldErr("Tanggal wajib diisi.");
    if (!medId) return setFieldErr("Pilih obat dari daftar.");
    if (!isFinite(qtyNum) || qtyNum === 0) return setFieldErr("Jumlah harus angka dan tidak boleh nol.");
    if (mutation === "P" && qtyNum < 0) return setFieldErr("Untuk kuantitas retur (negatif), pilih mutasi Retur (R).");
    if (!isFinite(priceNum) || priceNum < 0) return setFieldErr("Harga tidak boleh negatif.");
    setSaving(true);
    try {
      const payload = { date, medicineId: medId, quantity: mutation === "R" ? -Math.abs(qtyNum) : Math.abs(qtyNum), unitPrice: priceNum, mutation };
      if (isEdit) await api(`/api/sales/${editing!.id}`, { method: "PATCH", json: payload });
      else await api("/api/sales", { method: "POST", json: payload });
      toast.success(isEdit ? "Transaksi berhasil diperbarui." : "Transaksi berhasil ditambahkan.");
      onSaved();
    } catch (err) {
      setFieldErr((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Ubah Transaksi Penjualan" : "Tambah Transaksi Penjualan"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Perbaiki detail transaksi di bawah ini." : "Isi detail transaksi. Gunakan mutasi Retur untuk pengembalian barang."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-date">Tanggal</Label>
              <Input id="sale-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>Mutasi</Label>
              <Select value={mutation} onValueChange={setMutation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="P">P — Penjualan</SelectItem>
                  <SelectItem value="R">R — Retur</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Obat</Label>
            <Select value={medId} onValueChange={onMedChange}>
              <SelectTrigger><SelectValue placeholder="Pilih obat" /></SelectTrigger>
              <SelectContent>
                {medicines.map((m) => <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sale-qty">Jumlah</Label>
              <Input id="sale-qty" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sale-price">Harga Satuan (Rp)</Label>
              <Input id="sale-price" type="number" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </div>
          </div>
          {qty && price && (
            <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-foreground">{rp(Math.abs(Number(qty) || 0) * (Number(price) || 0))}</span></p>
          )}
          {fieldErr && (
            <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{fieldErr}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEdit ? "Simpan Perubahan" : "Simpan Transaksi"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ImportWizard({ open, onOpenChange, onDone, kind = "sales" }: {
  open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void; kind?: "sales" | "weather";
}) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [preview, setPreview] = useState<{
    totalRows: number; validCount: number; skipped?: number; errorCount: number;
    errors: { row: number; message: string }[];
    preview: Record<string, unknown>[];
  } | null>(null);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; skipped?: number; errorCount: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setFile(null); setStep(1); setPreview(null); setResult(null); setCommitting(false);
  }

  function readFile(f: File): Promise<{ format: string; content: string }> {
    if (f.name.toLowerCase().endsWith(".xlsx") || f.name.toLowerCase().endsWith(".xls")) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const b64 = btoa(
            new Uint8Array(reader.result as ArrayBuffer).reduce((s, b) => s + String.fromCharCode(b), "")
          );
          resolve({ format: "xlsx", content: b64 });
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(f);
      });
    }
    return f.text().then((content) => ({ format: "csv", content }));
  }

  async function doPreview() {
    if (!file) { toast.error("Pilih berkas terlebih dahulu."); return; }
    try {
      const { format, content } = await readFile(file);
      const res = await api<NonNullable<typeof preview>>(`/api/${kind === "sales" ? "sales" : "weather"}/import`, {
        method: "POST", json: { format, content, mode: "preview" },
      });
      setPreview(res);
      setStep(2);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function doCommit() {
    if (!file) return;
    setCommitting(true);
    try {
      const { format, content } = await readFile(file);
      const res = await api<{ inserted: number; skipped?: number; errorCount: number }>(`/api/${kind === "sales" ? "sales" : "weather"}/import`, {
        method: "POST", json: { format, content, mode: "commit" },
      });
      setResult(res);
      setStep(3);
      toast.success(`${res.inserted} baris berhasil diimpor.`);
      onDone();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  const template = kind === "sales" ? "/datasets/template_penjualan.csv" : "/datasets/template_cuaca.csv";

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Impor Data {kind === "sales" ? "Penjualan" : "Cuaca"}</DialogTitle>
          <DialogDescription>
            Langkah 1: pilih berkas → 2: pratinjau &amp; validasi → 3: proses impor. Gunakan template agar kolom terbaca dengan benar.
          </DialogDescription>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-xl p-6 text-center cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => inputRef.current?.click()}
              role="button" tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter") inputRef.current?.click(); }}
            >
              <Upload className="size-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-sm font-medium">{file ? file.name : "Klik untuk memilih berkas"}</p>
              <p className="text-xs text-muted-foreground mt-1">CSV atau Excel (.xlsx)</p>
              <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
            <a href={template} download className="text-xs text-primary underline flex items-center gap-1">
              <Download className="size-3" /> Unduh template CSV
            </a>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
              <Button onClick={doPreview} disabled={!file}>Pratinjau &amp; Validasi</Button>
            </DialogFooter>
          </div>
        )}

        {step === 2 && preview && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border p-2.5">
                <p className="text-xs text-muted-foreground">Baris Berkas</p>
                <p className="font-bold">{num(preview.totalRows)}</p>
              </div>
              <div className="rounded-lg border p-2.5 bg-success/5">
                <p className="text-xs text-muted-foreground">Valid</p>
                <p className="font-bold text-success">{num(preview.validCount)}</p>
              </div>
              <div className="rounded-lg border p-2.5 bg-destructive/5">
                <p className="text-xs text-muted-foreground">Gagal</p>
                <p className="font-bold text-danger">{num(preview.errorCount)}</p>
              </div>
            </div>
            {preview.preview.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border text-xs">
                <table className="w-full">
                  <thead className="bg-muted/60 sticky top-0">
                    <tr>{Object.keys(preview.preview[0]).map((k) => <th key={k} className="px-2 py-1.5 text-left font-medium">{k}</th>)}</tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} className="border-t">{Object.values(row).map((v, j) => <td key={j} className="px-2 py-1.5">{String(v)}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {preview.errors.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-destructive/30 bg-destructive/5 p-2 text-xs space-y-1">
                {preview.errors.map((e, i) => (
                  <p key={i} className="text-danger">Baris {e.row}: {e.message}</p>
                ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setStep(1); setPreview(null); }}>Kembali</Button>
              <Button onClick={doCommit} disabled={committing || preview.validCount === 0}>
                {committing && <Loader2 className="size-4 animate-spin" />}
                Impor {preview.validCount} Baris
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 3 && result && (
          <div className="space-y-4 text-center py-4">
            <div className="size-12 rounded-full bg-success/10 text-success flex items-center justify-center mx-auto">
              <ShoppingBasket className="size-6" />
            </div>
            <div>
              <p className="font-semibold">{result.inserted} baris berhasil diimpor</p>
              <p className="text-sm text-muted-foreground">
                {result.skipped ? `${result.skipped} duplikat dilewati. ` : ""}{result.errorCount ? `${result.errorCount} baris gagal validasi.` : "Semua baris valid."}
              </p>
            </div>
            <DialogFooter>
              <Button onClick={() => { onOpenChange(false); reset(); }}>Selesai</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
