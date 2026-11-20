"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, num, rp } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyHint, ErrorBox } from "@/components/views/dashboard";
import { toast } from "sonner";
import type { UserInfo } from "@/components/login-view";
import {
  Star, ShoppingCart, RefreshCcw, CheckCircle2, XCircle, Pencil, History, Loader2,
  FileText, FileSpreadsheet, ClipboardList, Pill, Info,
} from "lucide-react";

interface RecItem {
  id: string; medicineId: string; medicineName: string; medicineCode: string; unit: string;
  currentStock: number; forecastDemand: number; minStock: number; safetyStock: number;
  recommendedQty: number; adjustedQty: number | null; finalQty: number; reason: string | null;
  urgency: string; unitPrice: number; lineTotal: number;
}
interface Rec {
  id: string; code: string; status: string; periodWeeks: number; totalAmount: number;
  safetyWeeks: number; coverageNote: string | null; createdAt: string; decidedAt: string | null; createdBy: string | null;
  items: RecItem[];
}
interface ProcResp {
  recommendation: Rec | null;
  history: { id: string; code: string; status: string; totalAmount: number; itemCount: number; createdAt: string; createdBy: string | null }[];
}

const URGENCY_STYLES: Record<string, string> = {
  KRITIS: "bg-danger text-white border-danger",
  TINGGI: "bg-danger/10 text-danger border-danger/40",
  SEDANG: "bg-warning/15 text-warning border-warning/40",
  RENDAH: "bg-success/10 text-success border-success/40",
};
const URGENCY_LABEL: Record<string, string> = {
  KRITIS: "Urgensi Kritis", TINGGI: "Urgensi Tinggi", SEDANG: "Urgensi Sedang", RENDAH: "Rendah",
};

export function PengadaanView({ user }: { user: UserInfo }) {
  const [resp, setResp] = useState<ProcResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [adjusting, setAdjusting] = useState<RecItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const isAdmin = user.role === "Admin";
  const rec = resp?.recommendation ?? null;
  const prioritas = rec ? rec.items.filter((i) => i.urgency === "TINGGI" || i.urgency === "KRITIS").length : 0;

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<ProcResp>("/api/procurement")
      .then(setResp)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await api<{ code: string; totalAmount: number }>("/api/procurement", { method: "POST", json: { weeks: 4 } });
      toast.success(`Rekomendasi ${res.code} dibuat (${rp(res.totalAmount)}).`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setGenerating(false);
    }
  }

  async function action(kind: "approve" | "cancel") {
    if (!rec) return;
    try {
      await api("/api/procurement", { method: "PATCH", json: { action: kind, id: rec.id } });
      toast.success(kind === "approve" ? "Rekomendasi disetujui." : "Rekomendasi dibatalkan.");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function exportReport(format: "pdf" | "xlsx" | "csv") {
    const url = `/api/reports/export?type=pengadaan&format=${format}`;
    const a = document.createElement("a");
    a.href = url; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
    toast.success(`Laporan pengadaan diekspor ke ${format.toUpperCase()}.`);
  }

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}</div>;
  }
  if (error) return <ErrorBox message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      {/* Header total */}
      <Card className="bg-gradient-to-r from-accent to-card border-primary/25">
        <CardContent className="p-4 lg:p-5">
          <div className="flex flex-wrap items-center gap-4">
            <span className="size-12 rounded-2xl bg-warning/15 text-warning flex items-center justify-center shrink-0">
              <Star className="size-6" />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Total Rekomendasi {rec ? `· ${rec.code}` : ""}</p>
              <p className="text-2xl font-bold text-foreground">{rec ? rp(rec.totalAmount) : "-"}</p>
            </div>
            {rec && (
              <Badge className="bg-success/10 text-success border-success/30 ml-auto" variant="outline">
                <ClipboardList className="size-3.5" /> Prioritas: {prioritas} Obat
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {!rec || rec.status === "DIBATALKAN" ? (
              <Button onClick={generate} disabled={generating}>
                {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCcw className="size-4" />}
                Buat Rekomendasi Pengadaan
              </Button>
            ) : (
              <>
                <Button onClick={() => exportReport("pdf")}>
                  <FileText className="size-4" /> Buat Daftar Pembelian (PDF)
                </Button>
                <Button variant="outline" onClick={() => exportReport("xlsx")}>
                  <FileSpreadsheet className="size-4" /> Excel
                </Button>
                <Button variant="outline" onClick={() => setShowHistory(true)}><History className="size-4" /> Riwayat</Button>
                {rec.status === "DRAFT" && (
                  <>
                    <Button variant="outline" className="text-success border-success/40 hover:bg-success/10" onClick={() => action("approve")}>
                      <CheckCircle2 className="size-4" /> Setujui
                    </Button>
                    <Button variant="outline" className="text-danger border-danger/40 hover:bg-danger/10" onClick={() => setCancelling(true)}>
                      <XCircle className="size-4" /> Batalkan
                    </Button>
                  </>
                )}
                {isAdmin && rec.status === "DRAFT" && (
                  <Button variant="outline" onClick={generate} disabled={generating}>
                    <RefreshCcw className="size-4" /> Hitung Ulang
                  </Button>
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Transparansi perhitungan */}
      <Card>
        <CardContent className="p-4 flex items-start gap-2.5 text-sm">
          <Info className="size-4 text-info shrink-0 mt-0.5" />
          <div className="text-[13px] text-muted-foreground">
            <span className="font-semibold text-foreground">Logika perhitungan: </span>
            Kebutuhan bersih = prakiraan permintaan {rec?.periodWeeks ?? 4} pekan + stok pengaman {num(rec?.safetyWeeks ?? 1, 1)} pekan − stok tersedia.
            Jumlah pembelian = maksimum(0, kebutuhan bersih), dibulatkan ke satuan pembelian.
            Prediksi permintaan tidak sama dengan jumlah pembelian — stok tersedia dan stok pengaman ikut diperhitungkan.
            Asumsi dapat diubah pada menu Pengaturan.
          </div>
        </CardContent>
      </Card>

      {/* Daftar rekomendasi */}
      {rec && rec.status !== "DIBATALKAN" ? (
        <>
          <div className="hidden lg:block">
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b bg-muted/40">
                        <th className="text-left font-medium px-4 py-2.5">Nama Obat</th>
                        <th className="text-right font-medium px-4 py-2.5">Stok Saat Ini</th>
                        <th className="text-right font-medium px-4 py-2.5">Prediksi Kebutuhan</th>
                        <th className="text-right font-medium px-4 py-2.5">Stok Pengaman</th>
                        <th className="text-right font-medium px-4 py-2.5">Rekomendasi Beli</th>
                        <th className="text-right font-medium px-4 py-2.5">Nilai</th>
                        <th className="text-center font-medium px-4 py-2.5">Urgensi</th>
                        <th className="text-center font-medium px-4 py-2.5">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rec.items.map((it) => (
                        <tr key={it.id} className="border-b last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{it.medicineName}</td>
                          <td className="px-4 py-3 text-right">{num(it.currentStock)} <span className="text-xs text-muted-foreground">{it.unit.toLowerCase()}</span></td>
                          <td className="px-4 py-3 text-right text-primary font-medium">{num(it.forecastDemand, 0)} <span className="text-xs text-muted-foreground">unit</span></td>
                          <td className="px-4 py-3 text-right text-muted-foreground">{num(it.safetyStock, 0)}</td>
                          <td className="px-4 py-3 text-right font-bold">{num(it.finalQty)} <span className="text-xs text-muted-foreground font-normal">{it.unit.toLowerCase()}</span></td>
                          <td className="px-4 py-3 text-right">{rp(it.lineTotal)}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className={URGENCY_STYLES[it.urgency]}>{URGENCY_LABEL[it.urgency]}</Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground hover:text-foreground"
                              aria-label="Ubah jumlah pembelian" onClick={() => setAdjusting(it)}>
                              <Pencil className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Mobile cards */}
          <div className="lg:hidden space-y-3">
            {rec.items.map((it) => (
              <Card key={it.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2.5 mb-3">
                    <span className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <Pill className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{it.medicineName}</p>
                      <p className="text-xs text-muted-foreground">{it.medicineCode}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div className="rounded-lg bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Stok Saat Ini</p>
                      <p className="font-bold">{num(it.currentStock)} <span className="text-xs font-medium text-muted-foreground">{it.unit.toLowerCase()}</span></p>
                    </div>
                    <div className="rounded-lg bg-muted/50 px-3 py-2">
                      <p className="text-xs text-muted-foreground">Prediksi Kebutuhan</p>
                      <p className="font-bold">{num(it.forecastDemand, 0)} unit</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="rounded-lg bg-success/10 border border-success/25 px-3 py-2 flex-1">
                      <p className="text-xs text-muted-foreground">Rekomendasi Beli</p>
                      <p className="font-bold text-success">{num(it.finalQty)} {it.unit.toLowerCase()}</p>
                    </div>
                    <Badge variant="outline" className={`${URGENCY_STYLES[it.urgency]} h-fit py-1.5`}>{URGENCY_LABEL[it.urgency]}</Badge>
                  </div>
                  <button className="mt-3 w-full rounded-lg border py-2 text-sm font-medium text-primary hover:bg-accent flex items-center justify-center gap-1.5"
                    onClick={() => setAdjusting(it)}>
                    <Pencil className="size-3.5" /> Ubah Jumlah / Detail
                  </button>
                </CardContent>
              </Card>
            ))}
            <Button className="w-full h-12 font-semibold" onClick={() => exportReport("pdf")}>
              <ShoppingCart className="size-4" /> Buat Daftar Pembelian
            </Button>
          </div>

          {rec.status === "DISETPUJUI" && (
            <p className="text-xs text-success flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5" /> Disetujui oleh {rec.createdBy} pada {fmtDate(rec.decidedAt, "datetime")}.
            </p>
          )}
        </>
      ) : (
        <Card>
          <CardContent className="p-10 text-center">
            <ClipboardList className="size-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-foreground">Belum ada rekomendasi pengadaan</p>
            <p className="text-sm text-muted-foreground mt-1">Buat rekomendasi untuk mendapatkan usulan pembelian berbasis prediksi permintaan dan posisi stok.</p>
          </CardContent>
        </Card>
      )}

      {/* Dialog ubah jumlah */}
      {adjusting && (
        <AdjustQtyDialog item={adjusting} onClose={() => setAdjusting(null)} onSaved={() => { setAdjusting(null); load(); }} />
      )}

      {/* Konfirmasi batal */}
      <AlertDialog open={cancelling} onOpenChange={setCancelling}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Batalkan rekomendasi ini?</AlertDialogTitle>
            <AlertDialogDescription>
              Rekomendasi {rec?.code} akan ditandai dibatalkan. Anda dapat membuat rekomendasi baru kapan saja.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Kembali</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => { setCancelling(false); action("cancel"); }}>
              Batalkan Rekomendasi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Riwayat */}
      <Dialog open={showHistory} onOpenChange={setShowHistory}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Riwayat Rekomendasi</DialogTitle>
            <DialogDescription>Sepuluh rekomendasi terakhir beserta statusnya.</DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto space-y-2">
            {(resp?.history ?? []).length === 0 ? (
              <EmptyHint text="Belum ada riwayat rekomendasi." />
            ) : (
              resp!.history.map((h) => (
                <div key={h.id} className="rounded-lg border p-3 text-sm flex items-center gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{h.code}</p>
                    <p className="text-xs text-muted-foreground">{fmtDate(h.createdAt, "datetime")} · {h.itemCount} obat · oleh {h.createdBy}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="font-semibold">{rp(h.totalAmount)}</p>
                    <Badge variant="outline" className={
                      h.status === "DISETPUJUI" ? "bg-success/10 text-success border-success/30"
                      : h.status === "DIBATALKAN" ? "bg-muted text-muted-foreground"
                      : "bg-warning/10 text-warning border-warning/30"
                    }>
                      {h.status === "DISETPUJUI" ? "Disetujui" : h.status === "DIBATALKAN" ? "Dibatalkan" : "Draf"}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AdjustQtyDialog({ item, onClose, onSaved }: { item: RecItem; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(String(item.finalQty));
  const [reason, setReason] = useState(item.reason ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const q = Number(qty);
    if (!isFinite(q) || q < 0) return setErr("Jumlah pembelian tidak boleh negatif.");
    if (!reason.trim()) return setErr("Sertakan alasan perubahan agar tercatat pada riwayat.");
    setSaving(true);
    try {
      await api("/api/procurement", { method: "PATCH", json: { action: "adjust", itemId: item.id, adjustedQty: q, reason } });
      toast.success("Jumlah pembelian diperbarui.");
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
          <DialogTitle>Ubah Jumlah Pembelian — {item.medicineName}</DialogTitle>
          <DialogDescription>
            Rekomendasi sistem: {num(item.recommendedQty)} {item.unit.toLowerCase()} ({rp(item.lineTotal)}). Perubahan wajib menyertakan alasan.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label htmlFor="adj-qty">Jumlah Pembelian ({item.unit.toLowerCase()})</Label>
            <Input id="adj-qty" type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Nilai pembelian: {rp((Number(qty) || 0) * item.unitPrice)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="adj-reason">Alasan Perubahan</Label>
            <Textarea id="adj-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. anggaran bulan ini terbatas, pesan paruh dulu" required />
          </div>
          {err && <p className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2">{err}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Batal</Button>
            <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Simpan Perubahan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
