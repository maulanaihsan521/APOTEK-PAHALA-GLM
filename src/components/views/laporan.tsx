"use client";

import { useCallback, useEffect, useState } from "react";
import { api, fmtDate, num, rp } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyHint, ErrorBox } from "@/components/views/dashboard";
import { toast } from "sonner";
import type { Period } from "@/components/app-shell";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { FileText, FileSpreadsheet, FileDown, Loader2, Lightbulb, BarChart3 } from "lucide-react";

const TYPES = [
  { key: "penjualan", label: "Laporan Penjualan" },
  { key: "permintaan", label: "Laporan Permintaan Obat" },
  { key: "prediksi", label: "Laporan Prediksi" },
  { key: "evaluasi", label: "Laporan Evaluasi Model" },
  { key: "stok", label: "Laporan Stok" },
  { key: "pengadaan", label: "Laporan Rekomendasi Pengadaan" },
];

interface ReportData {
  type: string; title: string; periode: string; createdAt: string;
  summary: [string, string][];
  chart: { type: "bar" | "line"; title: string; data: (string | number | null)[][]; series: string[] } | null;
  table: { title?: string; headers: string[]; rows: (string | number | null)[][]; note?: string };
  insight: string[];
}

export function LaporanView({ period }: { period: Period }) {
  const [type, setType] = useState("penjualan");
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);

  useEffect(() => { setFrom(period.from); setTo(period.to); }, [period]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api<ReportData>(`/api/reports?type=${type}&from=${from}&to=${to}`)
      .then(setData)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [type, from, to]);

  useEffect(() => { load(); }, [load]);

  function exportAs(format: "pdf" | "xlsx" | "csv") {
    setExporting(format);
    const url = `/api/reports/export?type=${type}&from=${from}&to=${to}&format=${format}`;
    const a = document.createElement("a");
    a.href = url; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => setExporting(null), 1500);
    toast.success(`Laporan diekspor ke ${format.toUpperCase()}.`);
  }

  const chartData = (data?.chart?.data ?? []).map((row) => {
    const obj: Record<string, string | number | null> = { label: String(row[0]) };
    (data?.chart?.series ?? []).forEach((s, i) => { obj[s] = (row[i + 1] as number) ?? null; });
    return obj;
  });

  return (
    <div className="space-y-4">
      {/* Kontrol */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-2.5">
            <div className="space-y-1.5 min-w-[220px]">
              <Label>Jenis Laporan</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-from">Dari</Label>
              <Input id="rep-from" type="date" className="h-10 w-[145px]" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rep-to">Sampai</Label>
              <Input id="rep-to" type="date" className="h-10 w-[145px]" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              <Button className="bg-danger hover:bg-danger/90 text-white" onClick={() => exportAs("pdf")} disabled={!!exporting}>
                {exporting === "pdf" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} Export PDF
              </Button>
              <Button className="bg-success hover:bg-success/90 text-white" onClick={() => exportAs("xlsx")} disabled={!!exporting}>
                {exporting === "xlsx" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Export Excel
              </Button>
              <Button variant="outline" onClick={() => exportAs("csv")} disabled={!!exporting}>
                {exporting === "csv" ? <Loader2 className="size-4 animate-spin" /> : <FileDown className="size-4" />} CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-40 rounded-xl" />)}</div>
      ) : error ? (
        <ErrorBox message={error} onRetry={load} />
      ) : data ? (
        <>
          {/* Ringkasan */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {data.summary.map(([label, value]) => (
              <Card key={label}>
                <CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg lg:text-xl font-bold mt-1">{value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Grafik */}
          {data.chart && chartData.length > 0 && (
            <Card>
              <CardContent className="p-4 lg:p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <BarChart3 className="size-4" />
                  </span>
                  <h2 className="font-semibold text-[15px]">Visualisasi</h2>
                </div>
                <div className="h-[240px] lg:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    {data.chart.type === "bar" ? (
                      <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E3EBEF" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E3EBEF", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {data.chart.series.map((s, i) => (
                          <Bar key={s} dataKey={s} fill={["#087F6B", "#5BD0A9", "#3985D6", "#F2A93B"][i % 4]} radius={[4, 4, 0, 0]} />
                        ))}
                      </BarChart>
                    ) : (
                      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E3EBEF" vertical={false} />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: "#718096" }} axisLine={false} tickLine={false} width={44} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E3EBEF", fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {data.chart.series.map((s, i) => (
                          <Line key={s} type="monotone" dataKey={s} stroke={["#087F6B", "#5BD0A9", "#3985D6", "#F2A93B"][i % 4]}
                            strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Tabel */}
          <Card>
            <CardContent className="p-4 lg:p-5">
              <h2 className="font-semibold text-[15px] mb-3">{data.table.title ?? "Tabel Data"}</h2>
              {data.table.rows.length === 0 ? (
                <EmptyHint text="Tidak ada data pada periode ini." />
              ) : (
                <div className="max-scroll overflow-x-auto rounded-lg border">
                  <table className="w-full text-sm min-w-[480px]">
                    <thead className="sticky top-0">
                      <tr className="text-xs text-muted-foreground border-b bg-muted">
                        {data.table.headers.map((h) => (
                          <th key={h} className="px-3 py-2.5 text-left font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.table.rows.slice(0, 60).map((row, i) => (
                        <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                          {row.map((cell, j) => (
                            <td key={j} className={`px-3 py-2 ${j === 0 ? "font-medium" : "text-muted-foreground"}`}>{cell === null ? "-" : String(cell)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.table.note && <p className="text-xs text-muted-foreground mt-2">{data.table.note}</p>}
              {data.table.rows.length > 60 && (
                <p className="text-xs text-muted-foreground mt-1">Menampilkan 60 dari {num(data.table.rows.length)} baris — unduh ekspor untuk data lengkap.</p>
              )}
            </CardContent>
          </Card>

          {/* Insight */}
          <Card>
            <CardContent className="p-4 lg:p-5">
              <div className="flex items-center gap-2 mb-3">
                <span className="size-8 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
                  <Lightbulb className="size-4" />
                </span>
                <h2 className="font-semibold text-[15px]">Ringkasan Insight</h2>
              </div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {data.insight.map((ins, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-primary font-bold">{i + 1}.</span> {ins}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground text-center">
            Dokumen ekspor memuat logo Apotek Pahala, nama laporan, periode ({data.periode}), tanggal pembuatan ({data.createdAt}), tabel, grafik, dan nomor halaman.
          </p>
        </>
      ) : null}
    </div>
  );
}
