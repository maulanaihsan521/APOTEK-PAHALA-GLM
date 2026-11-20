"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, num } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyHint, ErrorBox } from "@/components/views/dashboard";
import { ImportWizard } from "@/components/views/penjualan";
import { toast } from "sonner";
import type { UserInfo } from "@/components/login-view";
import {
  Search, Plus, Pencil, History, Upload, Package, PackageCheck, PackageX, ScanLine, Loader2, FileDown, Boxes,
} from "lucide-react";

interface StockItem {
  id: string; code: string; name: string; category: string; unit: string;
  stockSystem: number; stockPhysical: number; selisih: number; minStock: number;
  status: string; statusLabel: string; lastOpnameAt: string | null;
}
interface StockResp {
  items: StockItem[];
  summary: { totalItems: number; totalStock: number; totalSelisih: number; perluPerhatian: number; kritis: number };
}
interface Movement {
  id: string; date: string; medicineName: string; type: string;
  beforeSystem: number; afterSystem: number; userName: string; note: string | null;
}

const STATUS_STYLES: Record<string, string> = {
  AMAN: "bg-success/10 text-success border-success/30",
  PERLU_PERHATIAN: "bg-warning/10 text-warning border-warning/30",
  KRITIS: "bg-danger/10 text-danger border-danger/30",
};

export function StokView({ user }: { user: UserInfo }) {
  const [resp, setResp] = useState<StockResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<StockItem | null>(null);
  const [adjusting, setAdjusting] = useState<StockItem | null>(null);
  const [opnameItem, setOpnameItem] = useState<StockItem | null>(null);
  const [historyFor, setHistoryFor] = useState<StockItem | null>(null);
  const [movements, setMovements] = useState<Movement[] | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const isAdmin = user.role === "Admin";

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (statusFilter) params.set("status", statusFilter);
    api<StockResp>(`/api/inventory?${params}`)
      .then(setResp)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [search, statusFilter]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) { setLoading(true); setError(null); } });
    load();
    return () => { alive = false; };
  }, [load]);

  async function openHistory(item: StockItem) {
    setHistoryFor(item);
    setMovements(null);
    try {
      const res = await api<{ movements: Movement[] }>(`/api/inventory/movements?medicineId=${item.id}&take=50`);
      setMovements(res.movements);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function exportCsv() {
    const rows = resp?.items ?? [];
    const header = "Kode;Nama;Kategori;Satuan;Stok Sistem;Stok Fisik;Selisih;Stok Minimum;Status";
    const body = rows.map((r) => [r.code, r.name, r.category, r.unit, r.stockSystem, r.stockPhysical, r.selisih, r.minStock, r.statusLabel].join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + header + "\n" + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "data-stok.csv"; a.click();
    URL.revokeObjectURL(url);
    toast.success("Data stok diekspor ke CSV.");
  }

  return (
    <div className="space-y-4">
      {/* Ringkasan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="relative overflow-hidden"><span className="absolute left-0 top-0 bottom-0 w-1 bg-primary" aria-hidden />
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><Boxes className="size-4" /></span>
            <div>
              <p className="text-[11px] text-muted-foreground">Total Stok</p>
              {resp ? (
                <p className="text-lg font-bold">{num(resp.summary.totalStock)} <span className="text-xs font-medium text-muted-foreground">item</span></p>
              ) : (
                <Skeleton className="h-6 w-16" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden"><span className="absolute left-0 top-0 bottom-0 w-1 bg-danger" aria-hidden />
          <CardContent className="p-3.5 flex items-center gap-2.5">
            <span className="size-9 rounded-full bg-danger/10 text-danger flex items-center justify-center shrink-0"><PackageX className="size-4" /></span>
            <div>
              <p className="text-[11px] text-muted-foreground">Selisih Opname</p>
              {resp ? (
                <p className={`text-lg font-bold ${resp.summary.totalSelisih < 0 ? "text-danger" : ""}`}>{num(resp.summary.totalSelisih)} <span className="text-xs font-medium text-muted-foreground">item</span></p>
              ) : (
                <Skeleton className="h-6 w-16" />
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden col-span-2 lg:col-span-2"><span className="absolute left-0 top-0 bottom-0 w-1 bg-warning" aria-hidden />
          <CardContent className="p-3.5 flex items-center gap-2.5 bg-warning/5">
            <span className="size-9 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0"><PackageCheck className="size-4" /></span>
            <div>
              {resp ? (
                <p className="text-sm font-medium text-foreground">Perlu perhatian pada {num(resp.summary.perluPerhatian)} jenis obat{resp.summary.kritis ? `, ${resp.summary.kritis} kritis` : ""}.</p>
              ) : (
                <Skeleton className="h-5 w-40" />
              )}
              <p className="text-xs text-muted-foreground">Status berdasarkan stok minimum yang dapat dikonfigurasi di Pengaturan.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input placeholder="Cari nama obat…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex items-center gap-1.5">
              {[
                { key: "", label: "Semua" },
                { key: "AMAN", label: "Aman" },
                { key: "PERLU_PERHATIAN", label: "Perhatian" },
                { key: "KRITIS", label: "Kritis" },
              ].map((f) => (
                <button key={f.key} onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    statusFilter === f.key
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:bg-muted"
                  }`}>
                  {f.key === "AMAN" && "🟢 "}{f.key === "PERLU_PERHATIAN" && "🟡 "}{f.key === "KRITIS" && "🔴 "}{f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              {isAdmin && (
                <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="size-4" /> Tambah Obat</Button>
              )}
              <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="size-4" /> Impor</Button>
              <Button variant="outline" onClick={exportCsv}><FileDown className="size-4" /> Ekspor</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daftar stok */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : error ? (
            <div className="p-4"><ErrorBox message={error} onRetry={load} /></div>
          ) : !resp || resp.items.length === 0 ? (
            <div className="p-8"><EmptyHint text="Tidak ada obat yang cocok dengan pencarian/filter." /></div>
          ) : (
            <>
              {/* Kartu mobile (master prompt: card/list per obat, tanpa scroll horizontal) */}
              <div className="lg:hidden divide-y">
                {resp.items.map((it) => (
                  <div key={it.id} className="p-4">
                    <div className="flex items-start gap-2.5 mb-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[15px] leading-tight">{it.name}</p>
                        <p className="text-xs text-muted-foreground">{it.code} · minimum {it.minStock} {it.unit.toLowerCase()}</p>
                      </div>
                      <Badge variant="outline" className={`${STATUS_STYLES[it.status]} shrink-0`}>
                        {it.status === "PERLU_PERHATIAN" ? "Periksa" : it.statusLabel}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center mb-2.5">
                      <div className="rounded-lg bg-muted/60 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Sistem</p>
                        <p className="font-bold text-sm">{num(it.stockSystem)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/60 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Fisik</p>
                        <p className="font-bold text-sm">{num(it.stockPhysical)}</p>
                      </div>
                      <div className="rounded-lg bg-muted/60 py-1.5">
                        <p className="text-[10px] text-muted-foreground">Selisih</p>
                        <p className={`font-bold text-sm ${it.selisih < 0 ? "text-danger" : it.selisih > 0 ? "text-info" : ""}`}>
                          {it.selisih > 0 ? `+${num(it.selisih)}` : num(it.selisih)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-1">
                      <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground" aria-label="Sesuaikan stok" onClick={() => setAdjusting(it)}>
                        <Pencil className="size-4" />
                      </button>
                      <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground" aria-label="Stock opname" onClick={() => setOpnameItem(it)}>
                        <ScanLine className="size-4" />
                      </button>
                      <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground" aria-label="Riwayat perubahan" onClick={() => openHistory(it)}>
                        <History className="size-4" />
                      </button>
                      {isAdmin && (
                        <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground" aria-label="Ubah data obat" onClick={() => { setEditing(it); setFormOpen(true); }}>
                          <Package className="size-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {/* Tabel desktop */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b bg-muted/40">
                      <th className="text-left font-medium px-4 py-2.5">Nama Obat</th>
                      <th className="text-right font-medium px-4 py-2.5">Stok Sistem</th>
                      <th className="text-right font-medium px-4 py-2.5">Stok Fisik</th>
                      <th className="text-right font-medium px-4 py-2.5">Selisih</th>
                      <th className="text-center font-medium px-4 py-2.5">Status</th>
                      <th className="text-center font-medium px-4 py-2.5">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resp.items.map((it) => (
                      <tr key={it.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">
                          <div className="font-medium">{it.name}</div>
                          <div className="text-xs text-muted-foreground">{it.code} · minimum {it.minStock} {it.unit.toLowerCase()}</div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold">{num(it.stockSystem)}</td>
                        <td className="px-4 py-2.5 text-right">{num(it.stockPhysical)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${it.selisih < 0 ? "text-danger" : it.selisih > 0 ? "text-info" : "text-muted-foreground"}`}>
                          {it.selisih > 0 ? `+${num(it.selisih)}` : num(it.selisih)}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <Badge variant="outline" className={STATUS_STYLES[it.status]}>
                            {it.status === "PERLU_PERHATIAN" ? "Periksa" : it.statusLabel}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="Sesuaikan stok" onClick={() => setAdjusting(it)}>
                              <Pencil className="size-4" />
                            </button>
                            <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="Stock opname" onClick={() => setOpnameItem(it)}>
                              <ScanLine className="size-4" />
                            </button>
                            <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="Riwayat perubahan" onClick={() => openHistory(it)}>
                              <History className="size-4" />
                            </button>
                            {isAdmin && (
                              <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                                aria-label="Ubah data obat" onClick={() => { setEditing(it); setFormOpen(true); }}>
                                <Package className="size-4" />
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
        </CardContent>
      </Card>

      <MedicineForm
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditing(null); }}
        editing={editing}
        onSaved={() => { setFormOpen(false); setEditing(null); load(); }}
      />
      {adjusting && (
        <AdjustDialog item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />
      )}
      {opnameItem && (
        <OpnameDialog item={opnameItem} onClose={() => setOpnameItem(null)} onSaved={() => { setOpnameItem(null); load(); }} />
      )}
      <HistoryDialog
        open={!!historyFor}
        onOpenChange={(o) => { if (!o) setHistoryFor(null); }}
        name={historyFor?.name ?? ""}
        movements={movements}
      />
      <ImportWizard open={importOpen} onOpenChange={setImportOpen} onDone={load} kind="sales" />
    </div>
  );
}

function MedicineForm({ open, onOpenChange, editing, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void;
  editing: StockItem | null; onSaved: () => void;
}) {
  const isEdit = !!editing;
  const [form, setForm] = useState({ code: "", name: "", category: "", unit: "Strip", basePrice: "", minStock: "", stockSystem: "0", stockPhysical: "0" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      if (editing) {
        setForm({
          code: editing.code, name: editing.name, category: editing.category, unit: editing.unit,
          basePrice: "", minStock: String(editing.minStock), stockSystem: String(editing.stockSystem), stockPhysical: String(editing.stockPhysical),
        });
      } else {
        setForm({ code: "", name: "", category: "", unit: "Strip", basePrice: "", minStock: "", stockSystem: "0", stockPhysical: "0" });
      }
    }
  }, [open, editing]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const basePrice = Number(form.basePrice || 0);
    const minStock = Number(form.minStock);
    if (!isEdit && !form.code.trim()) return setErr("Kode obat wajib diisi.");
    if (!form.name.trim()) return setErr("Nama obat wajib diisi.");
    if (!isEdit && (!isFinite(basePrice) || basePrice < 0)) return setErr("Harga tidak boleh negatif.");
    if (!isFinite(minStock) || minStock < 0) return setErr("Stok minimum tidak boleh negatif.");
    setSaving(true);
    try {
      if (isEdit) {
        await api(`/api/medicines/${editing!.id}`, {
          method: "PATCH",
          json: { name: form.name, category: form.category, unit: form.unit, minStock },
        });
        toast.success("Data obat diperbarui.");
      } else {
        await api("/api/medicines", {
          method: "POST",
          json: { code: form.code, name: form.name, category: form.category, unit: form.unit, basePrice, minStock, stockSystem: Number(form.stockSystem), stockPhysical: Number(form.stockPhysical) },
        });
        toast.success("Obat baru ditambahkan.");
      }
      onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Ubah Data Obat" : "Tambah Obat Baru"}</DialogTitle>
          <DialogDescription>{isEdit ? "Perbarui informasi dan stok minimum obat." : "Daftarkan obat beserta posisi stok awalnya."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          {!isEdit && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-code">Kode Obat</Label>
                <Input id="m-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="mis. O001" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-unit">Satuan</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger id="m-unit"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Strip">Strip</SelectItem>
                    <SelectItem value="Box">Box</SelectItem>
                    <SelectItem value="Botol">Botol</SelectItem>
                    <SelectItem value="Sachet">Sachet</SelectItem>
                    <SelectItem value="Tablet">Tablet</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="m-name">Nama Obat</Label>
            <Input id="m-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-cat">Kategori</Label>
            <Input id="m-cat" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="mis. Antibiotik" />
          </div>
          {!isEdit && (
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-price">Harga (Rp)</Label>
                <Input id="m-price" type="number" min="0" value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-sys">Stok Sistem</Label>
                <Input id="m-sys" type="number" min="0" value={form.stockSystem} onChange={(e) => setForm({ ...form, stockSystem: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-phys">Stok Fisik</Label>
                <Input id="m-phys" type="number" min="0" value={form.stockPhysical} onChange={(e) => setForm({ ...form, stockPhysical: e.target.value })} />
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="m-min">Stok Minimum (batas perlu perhatian)</Label>
            <Input id="m-min" type="number" min="0" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} required />
          </div>
          {err && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              Simpan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdjustDialog({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState("PENERIMAAN");
  const [delta, setDelta] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const d = Number(delta);
    if (!isFinite(d) || d === 0) return setErr("Isi jumlah perubahan stok (boleh negatif untuk pengurangan).");
    setSaving(true);
    try {
      await api("/api/inventory/adjust", { method: "POST", json: { medicineId: item.id, type, delta: d, note } });
      toast.success(`Stok ${item.name} berhasil disesuaikan.`);
      onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Penyesuaian Stok — {item.name}</DialogTitle>
          <DialogDescription>Stok saat ini: {item.stockSystem} {item.unit.toLowerCase()}. Setiap perubahan tercatat pada riwayat.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Jenis Perubahan</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PENERIMAAN">Penerimaan Barang</SelectItem>
                  <SelectItem value="PENGURANGAN">Pengurangan</SelectItem>
                  <SelectItem value="PENYESUAIAN">Koreksi / Penyesuaian</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adj-delta">Perubahan (±)</Label>
              <Input id="adj-delta" type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="mis. 20 atau -5" required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-note">Keterangan</Label>
            <Textarea id="adj-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. penerimaan dari pemasok Apotek Sentral" />
          </div>
          {delta && <p className="text-sm text-muted-foreground">Stok menjadi: <span className="font-bold text-foreground">{item.stockSystem + (Number(delta) || 0)} {item.unit.toLowerCase()}</span></p>}
          {err && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Simpan Penyesuaian</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OpnameDialog({ item, onClose, onSaved }: { item: StockItem; onClose: () => void; onSaved: () => void }) {
  const [physical, setPhysical] = useState(String(item.stockPhysical));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const p = Number(physical);
    if (!isFinite(p) || p < 0) return setErr("Stok fisik tidak boleh negatif.");
    setSaving(true);
    try {
      await api("/api/inventory/opname", { method: "POST", json: { medicineId: item.id, stockPhysical: p, note } });
      toast.success(`Stock opname ${item.name} disimpan.`);
      onSaved();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Stock Opname — {item.name}</DialogTitle>
          <DialogDescription>Catat hasil penghitungan fisik. Selisih = fisik − sistem (saat ini {item.selisih}).</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="op-physical">Stok Fisik (hasil hitung)</Label>
            <Input id="op-physical" type="number" min="0" value={physical} onChange={(e) => setPhysical(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="op-note">Catatan</Label>
            <Textarea id="op-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="mis. opname berkala akhir bulan" />
          </div>
          {err && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Simpan Opname</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ open, onOpenChange, name, movements }: {
  open: boolean; onOpenChange: (o: boolean) => void; name: string; movements: Movement[] | null;
}) {
  const TYPE_BADGE: Record<string, string> = {
    OPNAME: "bg-info/10 text-info",
    PENERIMAAN: "bg-success/10 text-success",
    PENJUALAN: "bg-primary/10 text-primary",
    PENGURANGAN: "bg-danger/10 text-danger",
    PENYESUAIAN: "bg-warning/10 text-warning",
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Riwayat Perubahan Stok</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        {!movements ? (
          <div className="space-y-2 py-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : movements.length === 0 ? (
          <EmptyHint text="Belum ada riwayat perubahan stok untuk obat ini." />
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-2">
            {movements.map((mv) => (
              <div key={mv.id} className="rounded-lg border p-3 text-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className={TYPE_BADGE[mv.type] ?? "bg-muted text-muted-foreground"} variant="outline">{mv.type}</Badge>
                  <span className="font-medium">{mv.beforeSystem} → {mv.afterSystem}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{fmtDate(mv.date, "datetime")}</span>
                </div>
                <p className="text-xs text-muted-foreground">{mv.note} — oleh {mv.userName}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
