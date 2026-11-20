"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, num } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyHint, ErrorBox } from "@/components/views/dashboard";
import { ImportWizard } from "@/components/views/penjualan";
import { toast } from "sonner";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Thermometer, CloudRain, Droplets, Database, Upload, FileDown, FileSpreadsheet, CloudSun, Info } from "lucide-react";

interface WeatherResp {
  rows: { id: string; date: string; temperature: number; rainfall: number; humidity: number; source: string }[];
  total: number; page: number; pageSize: number;
  kpi: { temp: number | null; rain: number | null; humidity: number | null };
  weekly: { weekStart: string; temp: number; rain: number; rh: number }[];
  meta: { source: string; dataFrom: string | null; lastDate: string | null; totalRecords: number };
}

export function CuacaView() {
  const [resp, setResp] = useState<WeatherResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [importOpen, setImportOpen] = useState(false);
  const pageSize = 10;

  const load = useCallback(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    api<WeatherResp>(`/api/weather?${params}`)
      .then(setResp)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [page, from, to]);

  useEffect(() => {
    let alive = true;
    queueMicrotask(() => { if (alive) { setLoading(true); setError(null); } });
    load();
    return () => { alive = false; };
  }, [load]);

  const kpi = resp?.kpi;
  const totalPages = resp ? Math.max(1, Math.ceil(resp.total / pageSize)) : 1;

  function exportUrl(format: "csv" | "xlsx") {
    const params = new URLSearchParams({ format });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return `/api/weather/export?${params}`;
  }

  return (
    <div className="space-y-4">
      {/* KPI cuaca */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="relative overflow-hidden"><span className="absolute left-0 top-0 bottom-0 w-1 bg-warning" aria-hidden />
          <CardContent className="p-3.5 lg:p-4">
            <div className="flex items-center gap-2.5">
              <span className="size-9 rounded-full bg-warning/10 text-warning flex items-center justify-center shrink-0">
                <Thermometer className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] lg:text-xs text-muted-foreground">Suhu Rata-rata</p>
                <p className="text-lg lg:text-2xl font-bold">{kpi?.temp != null ? `${num(kpi.temp, 1)}°C` : "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden"><span className="absolute left-0 top-0 bottom-0 w-1 bg-info" aria-hidden />
          <CardContent className="p-3.5 lg:p-4">
            <div className="flex items-center gap-2.5">
              <span className="size-9 rounded-full bg-info/10 text-info flex items-center justify-center shrink-0">
                <CloudRain className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] lg:text-xs text-muted-foreground">Curah Hujan</p>
                <p className="text-lg lg:text-2xl font-bold">{kpi?.rain != null ? `${num(kpi.rain, 1)} mm` : "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="relative overflow-hidden"><span className="absolute left-0 top-0 bottom-0 w-1 bg-primary" aria-hidden />
          <CardContent className="p-3.5 lg:p-4">
            <div className="flex items-center gap-2.5">
              <span className="size-9 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Droplets className="size-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] lg:text-xs text-muted-foreground">Kelembapan</p>
                <p className="text-lg lg:text-2xl font-bold">{kpi?.humidity != null ? `${num(kpi.humidity)}%` : "-"}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Info sumber */}
      <Card className="bg-accent/40 border-primary/20">
        <CardContent className="p-3.5 flex items-start gap-2.5 text-sm">
          <Database className="size-4 text-primary shrink-0 mt-0.5" />
          <div className="text-[13px] text-accent-foreground">
            <span className="font-semibold">Sumber data: {resp?.meta.source ?? "NASA POWER MERRA-2"}</span>
            <span className="block text-xs text-muted-foreground mt-0.5">
              Rentang data tampil: {fmtDate(resp?.meta.dataFrom)} s.d. {fmtDate(resp?.meta.lastDate)} · {num(resp?.meta.totalRecords)} hari tercatat di seluruh arsip · diperbarui {fmtDate(resp?.meta.lastDate, "datetime")}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tren cuaca */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <CloudSun className="size-4" />
            </span>
            <h2 className="font-semibold text-[15px]">Tren Cuaca Mingguan</h2>
          </div>
          {loading && !resp ? (
            <Skeleton className="h-[240px] w-full rounded-lg" />
          ) : (resp?.weekly?.length ?? 0) === 0 ? (
            <EmptyHint text="Belum ada data cuaca pada rentang ini." />
          ) : (
            <div className="h-[240px] lg:h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={resp!.weekly.map((w) => ({ ...w, label: fmtDate(w.weekStart) }))} margin={{ top: 8, right: 4, bottom: 0, left: -14 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E3EBEF" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#718096" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} width={40} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E3EBEF", fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="rain" name="Curah Hujan (mm)" fill="#3985D6" radius={[3, 3, 0, 0]} barSize={12} />
                  <Line yAxisId="right" type="monotone" dataKey="temp" name="Suhu (°C)" stroke="#F2A93B" strokeWidth={2} dot={{ r: 2.5 }} />
                  <Line yAxisId="right" type="monotone" dataKey="rh" name="Kelembapan (%)" stroke="#087F6B" strokeWidth={2} dot={{ r: 2.5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabel harian */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 className="font-semibold text-[15px]">Data Cuaca Harian</h2>
            <div className="flex flex-wrap items-center gap-2 ml-auto">
              <Input type="date" className="w-[140px] h-9" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="Tanggal awal" />
              <Input type="date" className="w-[140px] h-9" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Tanggal akhir" />
              {resp && <span className="text-xs text-muted-foreground">{num(resp.total)} hari</span>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}><Upload className="size-4" /> Impor Data Cuaca</Button>
            <Button variant="outline" size="sm" asChild><a href={exportUrl("csv")} download><FileDown className="size-4" /> Ekspor CSV</a></Button>
            <Button variant="outline" size="sm" asChild><a href={exportUrl("xlsx")} download><FileSpreadsheet className="size-4" /> Ekspor Excel</a></Button>
          </div>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
          ) : error ? (
            <ErrorBox message={error} onRetry={load} />
          ) : !resp || resp.rows.length === 0 ? (
            <EmptyHint text="Tidak ada data cuaca pada rentang ini. Impor data melalui tombol Impor." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[420px]">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b bg-muted/40">
                      <th className="text-left font-medium px-4 py-2.5">Tanggal</th>
                      <th className="text-right font-medium px-4 py-2.5">Suhu (°C)</th>
                      <th className="text-right font-medium px-4 py-2.5">Curah Hujan (mm)</th>
                      <th className="text-right font-medium px-4 py-2.5">Kelembapan (%)</th>
                      <th className="hidden sm:table-cell text-left font-medium px-4 py-2.5">Sumber</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resp.rows.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5">{fmtDate(r.date)}</td>
                        <td className="px-4 py-2.5 text-right">{num(r.temperature, 1)}</td>
                        <td className="px-4 py-2.5 text-right">{num(r.rainfall, 1)}</td>
                        <td className="px-4 py-2.5 text-right">{num(r.humidity)}</td>
                        <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-muted-foreground">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-3">
                  <span className="text-xs text-muted-foreground">Halaman {page} dari {totalPages}</span>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Sebelumnya</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Berikutnya</Button>
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-3 flex items-start gap-1.5">
                <Info className="size-3.5 shrink-0 mt-0.5" />
                Apabila integrasi API cuaca tidak tersedia, gunakan impor dataset historis (CSV/Excel). Variabel cuaca
                untuk horizon prediksi diisi dengan skenario normal iklim per nomor pekan.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <ImportWizard open={importOpen} onOpenChange={setImportOpen} onDone={load} kind="weather" />
    </div>
  );
}
