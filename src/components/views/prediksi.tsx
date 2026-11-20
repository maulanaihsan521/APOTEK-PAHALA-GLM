"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, fmtDate, num, pct } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyHint, ErrorBox } from "@/components/views/dashboard";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Search, CalendarDays, Loader2, Pill, BarChart3, Maximize2, TrendingUp, TrendingDown, MoveRight,
  BrainCircuit, Info, Zap,
} from "lucide-react";

interface Medicine { id: string; code: string; name: string; unit: string }
interface RunResult { weekNumber: number; weekStart: string; predicted: number }
interface Run {
  id: string; medicineName: string; medicineUnit: string; periodWeeks: number;
  avgDemand: number | null; nextWeekDemand: number | null; trend: string | null;
  mae: number | null; rmse: number | null; mape: number | null;
  featureNote: string | null; scenarioNote: string | null;
  results: RunResult[];
}
interface Evaluation { medicineCode: string; modelName: string; mae: number; rmse: number; mape: number; testWeeks: number }

const PERIODS = [1, 2, 4, 8, 12];

export function PrediksiView() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [medId, setMedId] = useState<string>("");
  const [weeks, setWeeks] = useState(4);
  const [run, setRun] = useState<Run | null>(null);
  const [evals, setEvals] = useState<Evaluation[]>([]);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    Promise.all([
      api<{ medicines: Medicine[] }>("/api/medicines"),
      api<{ evaluations: Evaluation[] }>("/api/model"),
    ])
      .then(([m, ev]) => {
        setMedicines(m.medicines);
        setEvals(ev.evaluations);
        if (m.medicines.length) {
          // bawaan sesuai mockup: Paracetamol (permintaan tertinggi)
          const def = m.medicines.find((x) => x.code === "P001") ?? m.medicines[0];
          setMedId(def.id);
          return api<{ run: Run | null }>(`/api/predict?medicineId=${def.id}&weeks=4`).then((r) => {
            if (r.run) setRun(r.run);
          });
        }
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const analyze = useCallback(async () => {
    if (!medId) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api<{ run: Run }>("/api/predict", { method: "POST", json: { medicineId: medId, weeks } });
      setRun(res.run);
      toast.success("Prediksi selesai dijalankan.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  }, [medId, weeks]);

  const med = medicines.find((m) => m.id === medId);
  const medEvals = evals.filter((e) => e.medicineCode === med?.code);
  const forecastChart = useMemo(() => {
    if (!run) return [];
    return run.results.map((r) => ({ label: `Minggu ${r.weekNumber}`, prediksi: r.predicted, tanggal: fmtDate(r.weekStart) }));
  }, [run]);

  const trendIcon = run?.trend === "NAIK" ? <TrendingUp className="size-4 text-success" />
    : run?.trend === "TURUN" ? <TrendingDown className="size-4 text-danger" />
    : <MoveRight className="size-4 text-muted-foreground" />;

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Kontrol */}
      <Card>
        <CardContent className="p-4 lg:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Pilih Obat</Label>
              <Select value={medId} onValueChange={setMedId}>
                <SelectTrigger className="h-11">
                  <span className="flex items-center gap-2 min-w-0">
                    <Pill className="size-4 text-primary shrink-0" />
                    <SelectValue placeholder="Pilih obat" className="truncate" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {medicines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name} ({m.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Periode Prediksi</Label>
              <Select value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
                <SelectTrigger className="h-11">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((p) => <SelectItem key={p} value={String(p)}>{p} Minggu</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={analyze} disabled={running || !medId} className="h-11 px-6 font-semibold">
              {running ? <><Loader2 className="size-4 animate-spin" /> Menganalisis…</> : <><Search className="size-4" /> Analisis Prediksi</>}
            </Button>
          </div>
          {running && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3 animate-spin" /> Menjalankan model Random Forest pada data historis… (beberapa detik)
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : error ? (
        <ErrorBox message={error} onRetry={() => setError(null)} />
      ) : !run ? (
        <Card>
          <CardContent className="p-10 text-center">
            <BarChart3 className="size-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="font-medium text-foreground">Belum ada hasil prediksi</p>
            <p className="text-sm text-muted-foreground mt-1">Pilih obat dan periode, lalu klik <span className="font-medium text-primary">Analisis Prediksi</span>.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* KPI Prediksi */}
          <div className="grid grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-3.5 lg:p-4 text-center">
                <p className="text-[11px] lg:text-xs text-muted-foreground">Permintaan Rata-rata</p>
                <p className="text-xl lg:text-2xl font-bold text-foreground mt-1">{num(run.avgDemand, 0)} <span className="text-xs font-medium text-muted-foreground">unit</span></p>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">per pekan</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 lg:p-4 text-center">
                <p className="text-[11px] lg:text-xs text-muted-foreground">Prediksi Minggu Depan</p>
                <p className="text-xl lg:text-2xl font-bold text-primary mt-1">{num(run.nextWeekDemand, 0)} <span className="text-xs font-medium text-muted-foreground">unit</span></p>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5 flex items-center justify-center gap-1">{trendIcon} {run.trend?.toLowerCase() ?? "-"}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3.5 lg:p-4 text-center">
                <p className="text-[11px] lg:text-xs text-muted-foreground">MAPE Model</p>
                <p className="text-xl lg:text-2xl font-bold text-foreground mt-1">{run.mape != null ? `${num(run.mape, 1)}%` : "-"}</p>
                <p className="text-[10px] lg:text-xs text-muted-foreground mt-0.5">data uji kronologis</p>
              </CardContent>
            </Card>
          </div>

          {/* Grafik */}
          <Card>
            <CardContent className="p-4 lg:p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold text-[15px]">Grafik Prediksi — {run.medicineName}</h2>
                <button onClick={() => setZoom(true)} className="rounded-lg p-1.5 hover:bg-muted text-muted-foreground" aria-label="Perbesar grafik">
                  <Maximize2 className="size-4" />
                </button>
              </div>
              <div className="h-[240px] lg:h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={forecastChart} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E3EBEF" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(value: number | string) => [`${num(Number(value))} unit`, "Prakiraan"]} contentStyle={{ borderRadius: 12, border: "1px solid #E3EBEF", fontSize: 12 }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
                    <Line type="monotone" dataKey="prediksi" name="Prakiraan" stroke="#087F6B" strokeWidth={2.4} strokeDasharray="6 4"
                      dot={{ r: 3.5, fill: "#087F6B" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-muted-foreground mt-2 flex items-start gap-1.5">
                <Info className="size-3.5 shrink-0 mt-0.5" />
                {run.scenarioNote}
              </p>
            </CardContent>
          </Card>

          {/* Tabel prediksi + informasi model */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 lg:p-5">
                <h2 className="font-semibold text-[15px] mb-3">Tabel Prediksi {run.periodWeeks} Minggu ke Depan</h2>
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {run.results.map((r) => (
                    <div key={r.weekNumber} className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-sm bg-muted/30">
                      <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <CalendarDays className="size-4" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium">Minggu {r.weekNumber}</div>
                        <div className="text-xs text-muted-foreground">mulai {fmtDate(r.weekStart)}</div>
                      </div>
                      <div className="ml-auto font-bold text-primary">{num(r.predicted, 0)} unit</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 lg:p-5">
                <h2 className="font-semibold text-[15px] mb-3 flex items-center gap-2">
                  <BrainCircuit className="size-4 text-primary" /> Informasi Model
                </h2>
                <div className="space-y-2.5 text-sm">
                  <Row label="Model" value="Random Forest Regression" />
                  <Row label="Akurasi (100 − MAPE)" value={run.mape != null ? `${num(100 - run.mape, 1)}%` : "-"} />
                  <Row label="MAE" value={run.mae != null ? `${num(run.mae, 1)} unit` : "-"} />
                  <Row label="RMSE" value={run.rmse != null ? `${num(run.rmse, 1)} unit` : "-"} />
                  <Row label="MAPE" value={run.mape != null ? `${num(run.mape, 1)}%` : "-"} />
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                  <Zap className="size-3.5 shrink-0 mt-0.5 text-warning" />
                  <span>{run.featureNote ?? "Fitur: penjualan historis + kalender + cuaca"}</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  MAPE lebih rendah berarti kesalahan persentase lebih kecil. MAPE dihitung hanya pada pekan dengan permintaan positif.
                  Prediksi merupakan estimasi, bukan angka pasti.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Perbandingan algoritma */}
          <Card>
            <CardContent className="p-4 lg:p-5">
              <h2 className="font-semibold text-[15px] mb-1">Perbandingan Algoritma — {med?.name ?? run.medicineName}</h2>
              <p className="text-xs text-muted-foreground mb-3">MAE, RMSE, dan MAPE pada data uji yang sama (pemisahan kronologis, tanpa kebocoran data).</p>
              {medEvals.length === 0 ? (
                <EmptyHint text="Model belum dilatih. Jalankan training pada menu Pengaturan untuk melihat perbandingan algoritma." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left font-medium py-2">Model</th>
                        <th className="text-right font-medium py-2">MAE</th>
                        <th className="text-right font-medium py-2">RMSE</th>
                        <th className="text-right font-medium py-2">MAPE</th>
                        <th className="text-right font-medium py-2 hidden sm:table-cell">Pekan Uji</th>
                      </tr>
                    </thead>
                    <tbody>
                      {medEvals.map((e) => {
                        const isMain = e.modelName.startsWith("Random Forest");
                        return (
                          <tr key={e.modelName} className={`border-b last:border-0 ${isMain ? "bg-accent/60" : "hover:bg-muted/40"}`}>
                            <td className="py-2.5 font-medium">
                              {e.modelName}
                              {isMain && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground font-semibold">UTAMA</span>}
                            </td>
                            <td className="py-2.5 text-right">{num(e.mae, 1)}</td>
                            <td className="py-2.5 text-right">{num(e.rmse, 1)}</td>
                            <td className="py-2.5 text-right">{pct(e.mape)}</td>
                            <td className="py-2.5 text-right hidden sm:table-cell">{e.testWeeks}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Dialog grafik besar */}
      {zoom && run && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setZoom(false)}>
          <div className="bg-card rounded-2xl w-full max-w-3xl p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">Grafik Prediksi — {run.medicineName}</h3>
              <Button variant="outline" size="sm" onClick={() => setZoom(false)}>Tutup</Button>
            </div>
            <div className="h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={forecastChart} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3EBEF" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#718096" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#718096" }} width={44} />
                  <Tooltip formatter={(value: number | string) => [`${num(Number(value))} unit`, "Prakiraan"]} contentStyle={{ borderRadius: 12 }} />
                  <Line type="monotone" dataKey="prediksi" name="Prakiraan" stroke="#087F6B" strokeWidth={2.4} strokeDasharray="6 4" dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-dashed pb-1.5 last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-medium text-foreground text-sm">{value}</span>
    </div>
  );
}
