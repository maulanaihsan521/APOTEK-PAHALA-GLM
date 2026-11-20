"use client";

import { useEffect, useMemo, useState } from "react";
import { api, fmtDate, num } from "@/lib/client";
import { ApotekArt } from "@/components/logo";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Period } from "@/components/app-shell";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  ShoppingCart, Pill, TriangleAlert, Target, CalendarDays, Trophy, Package,
  ArrowUpRight, ArrowDownRight, Lightbulb, Activity, Minus, CheckCircle2, AlertTriangle, AlertCircle, PackageSearch,
} from "lucide-react";

interface DashboardData {
  kpi: {
    revenue: number; revenueLabel: string; revenueDeltaPct: number | null;
    demand: number; demandDeltaPct: number | null;
    priorityCount: number;
    priorityBreakdown?: { perluPerhatian: number; kritis: number };
    mape: number | null; accuracy: number | null; testWeeks: number | null;
  };
  focus: { id: string; name: string } | null;
  trend: { label: string; weekStart: string; aktual: number | null; prediksi: number | null }[];
  ringkasanPrediksi: { medicineName: string; periodWeeks: number; trend: string | null; weeks: { label: string; value: number }[]; scenarioNote: string | null } | null;
  top5: { id: string; name: string; terjual: number; prediksi: number | null; spark: number[] }[];
  stockStatus: { status: string; label: string; count: number; pct: number }[];
  activities: { id: string; userName: string; message: string; createdAt: string }[];
}

export function DashboardView({ period }: { period: Period }) {
  const [range, setRange] = useState<4 | 12 | 26 | 52>(4);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) { setLoading(true); setError(null); } });
    api<DashboardData>(`/api/dashboard?from=${period.from}&to=${period.to}&range=${range}`)
      .then((res) => { if (alive) { setData(res); setLoading(false); } })
      .catch((e) => { if (alive) { setError((e as Error).message); setLoading(false); } });
    return () => { alive = false; };
  }, [period.from, period.to, range]);

  const kpis = data?.kpi;
  const kpiCards = useMemo(() => [
    {
      label: "Total Penjualan", value: kpis?.revenueLabel ?? "-", icon: ShoppingCart,
      chip: "bg-success/10 text-success", bar: "bg-success",
      delta: kpis?.revenueDeltaPct != null ? `${kpis.revenueDeltaPct >= 0 ? "" : "-"}${num(Math.abs(kpis.revenueDeltaPct), 1)}% dari bulan lalu` : "vs periode sebelumnya",
      deltaVal: kpis?.revenueDeltaPct ?? null,
    },
    {
      label: "Total Permintaan", value: kpis ? `${num(kpis.demand)} unit` : "-", icon: Pill,
      chip: "bg-info/10 text-info", bar: "bg-info",
      delta: kpis?.demandDeltaPct != null ? `${kpis.demandDeltaPct >= 0 ? "" : "-"}${num(Math.abs(kpis.demandDeltaPct), 1)}% dari bulan lalu` : "vs periode sebelumnya",
      deltaVal: kpis?.demandDeltaPct ?? null,
    },
    {
      label: "Obat Prioritas", value: kpis ? `${kpis.priorityCount} obat` : "-", icon: TriangleAlert,
      chip: "bg-warning/10 text-warning", bar: "bg-warning",
      delta: kpis?.priorityBreakdown ? `${kpis.priorityBreakdown.kritis} kritis, ${kpis.priorityBreakdown.perluPerhatian} perlu perhatian` : "Stok perlu tindakan", deltaVal: null,
    },
    {
      label: "MAPE Model", value: kpis?.mape != null ? `${num(kpis.mape, 1)}%` : "-", icon: Target,
      chip: "bg-violet-brand/10 text-violet-brand", bar: "bg-violet-brand",
      delta: kpis?.accuracy != null ? `Akurasi ${num(kpis.accuracy, 1)}%` : "Model belum dilatih",
      deltaVal: null,
    },
  ], [kpis]);

  const trendText = data?.ringkasanPrediksi?.trend === "NAIK"
    ? "Prediksi menunjukkan tren peningkatan permintaan."
    : data?.ringkasanPrediksi?.trend === "TURUN"
      ? "Prediksi menunjukkan kecenderungan penurunan permintaan."
      : "Prediksi relatif stabil dibanding periode sebelumnya.";

  if (error) {
    return <ErrorBox message={error} onRetry={() => { setLoading(true); setError(null); setData(null); }} />;
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      {/* Sapaan mobile sesuai mockup */}
      <Card className="lg:hidden bg-gradient-to-r from-accent to-card border-primary/20 overflow-hidden">
        <CardContent className="p-4 flex items-center justify-between gap-3">
          <div>
            <p className="font-bold text-foreground leading-snug">Selamat datang,<br />Pengelola Apotek 👋</p>
            <p className="text-xs text-muted-foreground mt-1">Berikut ringkasan kondisi apotek hari ini</p>
          </div>
          <ApotekArt className="w-28 shrink-0" />
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        {kpis === null && loading
          ? [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-[104px] rounded-xl" />)
          : kpiCards.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>

      {/* Tren + Ringkasan Prediksi */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardContent className="p-4 lg:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Activity className="size-4" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-semibold text-[15px] leading-tight">Tren Penjualan &amp; Prediksi</h2>
                  {data?.focus && <p className="text-xs text-muted-foreground truncate">{data.focus.name} (obat permintaan tertinggi)</p>}
                </div>
              </div>
              <div className="flex items-center rounded-lg border overflow-hidden text-xs font-medium">
                {([4, 12, 26, 52] as const).map((r) => (
                  <button key={r} onClick={() => setRange(r)}
                    className={`px-2.5 py-1.5 sm:px-3 transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                    {r === 52 ? "1 Tahun" : r === 26 ? "6 Bulan" : `${r} Minggu`}
                  </button>
                ))}
              </div>
            </div>
            <TrendChart data={data?.trend ?? []} loading={loading} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <CalendarDays className="size-4" />
              </span>
              <h2 className="font-semibold text-[15px]">Ringkasan Prediksi</h2>
            </div>
            {loading && !data ? (
              <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            ) : data?.ringkasanPrediksi ? (
              <>
                <p className="text-xs text-muted-foreground mb-2">{data.ringkasanPrediksi.medicineName} · prakiraan {data.ringkasanPrediksi.periodWeeks} pekan</p>
                <div className="space-y-1.5">
                  {data.ringkasanPrediksi.weeks.map((w) => (
                    <div key={w.label} className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/50 text-sm">
                      <span className="text-muted-foreground">{w.label}</span>
                      <span className="font-bold text-foreground">{w.value} unit</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-start gap-2 rounded-xl bg-accent border border-primary/20 p-3 text-[13px] text-accent-foreground">
                  <Lightbulb className="size-4 shrink-0 mt-0.5 text-warning" />
                  <span>{trendText}</span>
                </div>
              </>
            ) : (
              <EmptyHint text="Belum ada prediksi. Buka menu Prediksi Permintaan dan jalankan analisis, atau lakukan training model di Pengaturan." />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top 5 + Status Stok */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 lg:p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="size-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                <Trophy className="size-4" />
              </span>
              <h2 className="font-semibold text-[15px]">Obat dengan Permintaan Tertinggi</h2>
            </div>
            {loading && !data ? (
              <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[380px]">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b">
                      <th className="text-left font-medium py-2">Nama Obat</th>
                      <th className="text-right font-medium py-2">Terjual</th>
                      <th className="text-right font-medium py-2">Prediksi</th>
                      <th className="text-center font-medium py-2 hidden sm:table-cell">Tren</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.top5 ?? []).map((t) => (
                      <tr key={t.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="py-2.5 font-medium">{t.name}</td>
                        <td className="py-2.5 text-right">{num(t.terjual)}</td>
                        <td className="py-2.5 text-right text-primary font-medium">{t.prediksi != null ? num(t.prediksi) : "-"}</td>
                        <td className="py-2.5 hidden sm:table-cell">
                          <div className="flex justify-center">
                            <Sparkline data={t.spark} />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!data?.top5?.length && (
                      <tr><td colSpan={4} className="py-6 text-center text-muted-foreground text-sm">Belum ada data penjualan pada periode ini.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 lg:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Package className="size-4" />
                </span>
                <h2 className="font-semibold text-[15px]">Status Persediaan</h2>
              </div>
            </div>
            {loading && !data ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-center">
                <div className="space-y-3.5">
                  {(data?.stockStatus ?? []).map((s) => (
                    <div key={s.status}>
                      <div className="flex items-center gap-2 text-sm mb-1">
                        {s.status === "AMAN" ? <CheckCircle2 className="size-4 text-success" /> :
                         s.status === "PERLU_PERHATIAN" ? <AlertTriangle className="size-4 text-warning" /> :
                         <AlertCircle className="size-4 text-danger" />}
                        <span className="font-medium">{s.label}</span>
                        <span className="text-muted-foreground text-xs">{s.count} obat</span>
                        <span className="ml-auto text-xs font-semibold">{s.pct}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${s.status === "AMAN" ? "bg-success" : s.status === "PERLU_PERHATIAN" ? "bg-warning" : "bg-danger"}`}
                          style={{ width: `${s.pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden sm:block">
                  <StockDonut data={data?.stockStatus ?? []} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Aktivitas Terbaru */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-8 rounded-lg bg-info/10 text-info flex items-center justify-center">
              <PackageSearch className="size-4" />
            </span>
            <h2 className="font-semibold text-[15px]">Aktivitas Terbaru</h2>
          </div>
          {loading && !data ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          ) : (data?.activities?.length ?? 0) === 0 ? (
            <EmptyHint text="Belum ada aktivitas tercatat." />
          ) : (
            <ul className="space-y-2">
              {data!.activities.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start gap-2.5 text-sm">
                  <span className="mt-1.5 size-2 rounded-full bg-primary shrink-0" />
                  <span className="text-foreground/90">{a.message}</span>
                  <span className="ml-auto text-xs text-muted-foreground shrink-0">{fmtDate(a.createdAt, "datetime")} · {a.userName}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="border-danger/40">
      <CardContent className="p-6 text-center">
        <AlertCircle className="size-8 text-danger mx-auto mb-2" />
        <p className="text-sm text-foreground font-medium mb-1">Terjadi kesalahan</p>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>Coba Lagi</Button>
        )}
      </CardContent>
    </Card>
  );
}

function KpiCard({ label, value, icon: Icon, chip, bar, delta, deltaVal }: {
  label: string; value: string; icon: typeof ShoppingCart; chip: string; bar: string;
  delta: string; deltaVal: number | null;
}) {
  return (
    <Card className="relative overflow-hidden">
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${bar}`} aria-hidden />
      <CardContent className="p-3.5 lg:p-5">
        <div className="flex items-center gap-2.5 lg:gap-3">
          <span className={`size-9 lg:size-11 rounded-full flex items-center justify-center shrink-0 ${chip}`}>
            <Icon className="size-4 lg:size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] lg:text-xs text-muted-foreground truncate">{label}</p>
            <p className="text-lg lg:text-2xl font-bold text-foreground leading-tight truncate">{value}</p>
          </div>
        </div>
        <p className="mt-2 lg:mt-2.5 text-[11px] lg:text-xs flex items-center gap-1 text-muted-foreground">
          {deltaVal !== null && (deltaVal >= 0
            ? <ArrowUpRight className="size-3.5 text-success" />
            : <ArrowDownRight className="size-3.5 text-danger" />)}
          <span className={deltaVal !== null ? (deltaVal >= 0 ? "text-success font-medium" : "text-danger font-medium") : ""}>{delta}</span>
        </p>
      </CardContent>
    </Card>
  );
}

function TrendChart({ data, loading }: { data: { label: string; aktual: number | null; prediksi: number | null }[]; loading: boolean }) {
  if (loading && data.length === 0) return <Skeleton className="h-[240px] w-full rounded-lg" />;
  if (data.length === 0) return <EmptyHint text="Belum cukup data untuk menampilkan tren." />;
  return (
    <div className="h-[240px] lg:h-[260px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E3EBEF" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid #E3EBEF", fontSize: 12 }}
            formatter={(value: number | string, name: string) => [`${num(Number(value))} unit`, name]}
          />
          <Legend iconType="plainline" wrapperStyle={{ fontSize: 12, paddingTop: 6 }} />
          <Line type="monotone" dataKey="aktual" name="Aktual" stroke="#087F6B" strokeWidth={2.4}
            dot={{ r: 3.5, fill: "#087F6B" }} connectNulls />
          <Line type="monotone" dataKey="prediksi" name="Prediksi" stroke="#5BD0A9" strokeWidth={2.4}
            strokeDasharray="6 4" dot={{ r: 3, fill: "#5BD0A9" }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return <Minus className="size-4 text-muted-foreground/40" />;
  return (
    <div className="w-16 h-7">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data.map((v, i) => ({ i, v }))}>
          <Line type="monotone" dataKey="v" stroke="#20B58A" strokeWidth={1.8} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

const DONUT_COLORS: Record<string, string> = { AMAN: "#16A36A", PERLU_PERHATIAN: "#F2A93B", KRITIS: "#E55353" };

function StockDonut({ data }: { data: { status: string; label: string; count: number; pct: number }[] }) {
  const rows = data.filter((d) => d.count > 0);
  if (rows.length === 0) return null;
  const aman = data.find((d) => d.status === "AMAN");
  return (
    <div className="relative w-[120px] h-[120px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="count" nameKey="label" innerRadius={38} outerRadius={56} paddingAngle={2} strokeWidth={0}>
            {rows.map((r) => <Cell key={r.status} fill={DONUT_COLORS[r.status]} />)}
          </Pie>
          <Tooltip formatter={(value: number | string, name: string) => [`${value} obat`, name]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-bold leading-none">{aman?.pct ?? 0}%</span>
        <span className="text-[10px] text-muted-foreground">Aman</span>
      </div>
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}
