import { db } from "@/lib/db";
import { ok, fail, requireUser, parseDate, rupiah } from "@/lib/api";

type ReportType = "penjualan" | "permintaan" | "prediksi" | "evaluasi" | "stok" | "pengadaan";

const TYPE_TITLES: Record<ReportType, string> = {
  penjualan: "Laporan Penjualan",
  permintaan: "Laporan Permintaan Obat",
  prediksi: "Laporan Prediksi Permintaan",
  evaluasi: "Laporan Evaluasi Model",
  stok: "Laporan Stok / Persediaan",
  pengadaan: "Laporan Rekomendasi Pengadaan",
};

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const type = (url.searchParams.get("type") || "penjualan") as ReportType;
  const from = parseDate(url.searchParams.get("from"), new Date(new Date().getFullYear(), new Date().getMonth(), 1))!;
  const to = parseDate(url.searchParams.get("to"), new Date())!;
  const toExcl = new Date(to.getTime() + 86399999);
  const medicineId = url.searchParams.get("medicineId") || undefined;

  const base = {
    type, title: TYPE_TITLES[type] ?? "Laporan",
    periode: `${fmt(from)} s.d. ${fmt(to)}`,
    createdAt: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB",
  };

  if (type === "penjualan" || type === "permintaan") {
    const sales = await db.sale.findMany({
      where: { date: { gte: from, lt: toExcl }, ...(medicineId ? { medicineId } : {}) },
      include: { medicine: { select: { name: true, code: true } } },
      orderBy: { date: "asc" },
    });
    const revenue = sales.reduce((s, r) => s + r.totalPrice, 0);
    const units = sales.reduce((s, r) => s + r.quantity, 0);
    const days = Math.max(1, Math.ceil((toExcl.getTime() - from.getTime()) / 86400000));
    const byMed = new Map<string, { name: string; code: string; units: number; revenue: number }>();
    const byMonth = new Map<string, { revenue: number; units: number }>();
    for (const r of sales) {
      const bm = byMed.get(r.medicineId) || { name: r.medicine.name, code: r.medicine.code, units: 0, revenue: 0 };
      bm.units += r.quantity; bm.revenue += r.totalPrice;
      byMed.set(r.medicineId, bm);
      const mk = r.date.toISOString().slice(0, 7);
      const mo = byMonth.get(mk) || { revenue: 0, units: 0 };
      mo.revenue += r.totalPrice; mo.units += r.quantity;
      byMonth.set(mk, mo);
    }
    const top = [...byMed.values()].sort((a, b) => b.units - a.units).slice(0, 10);
    const months = [...byMonth.entries()].sort().slice(-6);
    // periode pendek: grafik per hari (lebih informatif daripada 1 bar bulanan)
    const useDaily = days <= 62;
    const byDay = new Map<string, { revenue: number; units: number }>();
    if (useDaily) {
      for (const r of sales) {
        const dk = r.date.toISOString().slice(0, 10);
        const d = byDay.get(dk) || { revenue: 0, units: 0 };
        d.revenue += r.totalPrice; d.units += r.quantity;
        byDay.set(dk, d);
      }
    }
    const chartData = useDaily
      ? [...byDay.entries()].sort().map(([dk, v]) => [dk.slice(8, 10) + "/" + dk.slice(5, 7), Math.round(v.revenue / 1e3)])
      : months.map(([mk, v]) => [mk, Math.round(v.revenue / 1e5) / 10]);
    const chart = {
      type: "bar",
      title: useDaily ? "Penjualan Harian (Rp ribu)" : type === "penjualan" ? "Penjualan Bulanan (Rp juta)" : "Permintaan Bulanan (unit)",
      data: chartData,
      series: ["Nilai"],
    };
    return ok({
      ...base,
      summary: [
        ["Total Penjualan", rupiah(revenue)],
        ["Total Permintaan (neto)", `${units.toLocaleString("id-ID")} unit`],
        ["Jumlah Transaksi", sales.length.toLocaleString("id-ID")],
        ["Rata-rata per Hari", rupiah(revenue / days)],
      ],
      chart,
      table: {
        title: "Ringkasan per Obat (10 teratas)",
        headers: ["Nama Obat", "Kode", "Unit Terjual", "Nilai Penjualan"],
        rows: top.map((t) => [t.name, t.code, t.units.toLocaleString("id-ID"), rupiah(t.revenue)]),
        note: "Permintaan neto = penjualan (mutasi P) dikurangi retur (mutasi R).",
      },
      insight: [
        `Obat dengan permintaan tertinggi pada periode ini: ${top[0]?.name ?? "-"} (${top[0]?.units.toLocaleString("id-ID") ?? 0} unit).`,
        `Rata-rata nilai penjualan ${rupiah(revenue / days)} per hari selama ${days} hari.`,
        "Rekomendasi pengadaan dapat disusun dari hasil prediksi permintaan pada menu Rekomendasi Pengadaan.",
      ],
      exportRows: { headers: ["Nama Obat", "Kode", "Unit Terjual", "Nilai Penjualan"], rows: [...byMed.values()].sort((a, b) => b.units - a.units).map((t) => [t.name, t.code, t.units, t.revenue]) },
    });
  }

  if (type === "prediksi") {
    const meds = await db.medicine.findMany({ where: { isActive: true }, include: { inventory: true } });
    const runs = await db.predictionRun.findMany({
      orderBy: { createdAt: "desc" },
      include: { medicine: { select: { name: true } }, results: { orderBy: { weekNumber: "asc" } } },
    });
    const latestByMed = new Map<string, typeof runs[number]>();
    for (const r of runs) if (!latestByMed.has(r.medicineId)) latestByMed.set(r.medicineId, r);

    const rows = meds.map((m) => {
      const run = latestByMed.get(m.id);
      const forecast4 = run ? run.results.slice(0, 4).reduce((s, r) => s + r.predicted, 0) : null;
      return [
        m.name, m.inventory?.stockSystem ?? 0,
        run ? Math.round(run.avgDemand ?? 0) : "-",
        forecast4 !== null ? Math.round(forecast4) : "-",
        run?.trend ?? "-",
        run?.mape != null ? `${run.mape}%` : "-",
      ];
    });
    const chartData = [...latestByMed.values()].slice(0, 4).flatMap((r) =>
      r.results.slice(0, 4).map((x) => ({ med: r.medicine.name, week: x.weekNumber, val: Math.round(x.predicted) }))
    );
    const weeksSet = [1, 2, 3, 4];
    const chart = {
      type: "line", title: "Prakiraan 4 Pekan ke Depan (unit/pekan)",
      data: weeksSet.map((wk) => [
        `Minggu ${wk}`,
        ...[...latestByMed.values()].slice(0, 4).map((r) => r.results.slice(0, 4).find((x) => x.weekNumber === wk)?.predicted ?? null),
      ]),
      series: [...latestByMed.values()].slice(0, 4).map((r) => r.medicine.name),
    };
    return ok({
      ...base,
      summary: [
        ["Obat Dianalisis", `${meds.length} obat`],
        ["Model Utama", "Random Forest Regression"],
        ["Total Prakiraan 4 Pekan", `${rows.reduce((s, r) => s + (typeof r[3] === "number" ? r[3] : 0), 0).toLocaleString("id-ID")} unit`],
        ["Skenario Cuaca", "Normal iklim per pekan"],
      ],
      chart,
      table: {
        title: "Prakiraan per Obat",
        headers: ["Nama Obat", "Stok Saat Ini", "Rata-rata/pekan", "Prakiraan 4 Pekan", "Tren", "MAPE"],
        rows,
        note: "Prakiraan merupakan estimasi dengan skenario cuaca normal iklim; baca bersama MAPE.",
      },
      insight: [
        "Prediksi menggunakan fitur lag 1-8 pekan, rata-rata bergulir, kalender, dan variabel cuaca.",
        "Tren NAIK berarti prakiraan 4 pekan lebih tinggi dari 4 pekan aktual terakhir.",
        "Angka prakiraan bukan angka pasti - gunakan sebagai bahan pertimbangan pengadaan.",
      ],
      exportRows: { headers: ["Nama Obat", "Stok", "Rata-rata/pekan", "Prakiraan 4 Pekan", "Tren", "MAPE"], rows },
    });
  }

  if (type === "evaluasi") {
    const evals = await db.modelEvaluation.findMany({ include: { medicine: { select: { name: true } } }, orderBy: [{ medicineId: "asc" }, { modelName: "asc" }] });
    const models = ["Random Forest Regression", "Linear Regression", "Decision Tree Regression", "Naif (Pekan Sebelumnya)"];
    const meds = [...new Set(evals.map((e) => e.medicine.name))];
    const chart = {
      type: "bar", title: "Perbandingan MAPE antar Model (%)",
      data: meds.map((mn) => [mn.split(" ")[0], ...models.map((mo) => evals.find((e) => e.medicine.name === mn && e.modelName === mo)?.mape ?? null)]),
      series: models.map((m) => m.replace(" Regression", "").replace("Naif (Pekan Sebelumnya)", "Naif")),
    };
    return ok({
      ...base,
      summary: [
        ["Model Utama", "Random Forest Regression"],
        ["MAPE Rata-rata RF", `${avg(evals.filter((e) => e.modelName === models[0]).map((e) => e.mape))}%`],
        ["MAPE Naif", `${avg(evals.filter((e) => e.modelName === models[3]).map((e) => e.mape))}%`],
        ["Pemisahan Data", "Kronologis (tanpa pengacakan)"],
      ],
      chart,
      table: {
        title: "Metrik MAE, RMSE, dan MAPE per Obat",
        headers: ["Obat", "Model", "MAE", "RMSE", "MAPE", "Pekan Uji"],
        rows: evals.filter((e) => e.mae !== null).map((e) => [e.medicine.name, e.modelName, e.mae, e.rmse, `${e.mape}%`, e.testWeeks]),
        note: "MAPE dihitung hanya pada pekan dengan permintaan positif; MAPE lebih rendah = kesalahan persentase lebih kecil.",
      },
      insight: [
        "Random Forest menjadi model utama; Linear Regression & Decision Tree menjadi pembanding.",
        "Naif (nilai pekan sebelumnya) menjadi garis dasar minimal yang harus diungguli model.",
        "Evaluasi memakai data uji terpisah secara kronologis agar tidak terjadi kebocoran data masa depan.",
      ],
      exportRows: { headers: ["Obat", "Model", "MAE", "RMSE", "MAPE", "Pekan Uji"], rows: evals.filter((e) => e.mae !== null).map((e) => [e.medicine.name, e.modelName, e.mae, e.rmse, e.mape, e.testWeeks]) },
    });
  }

  if (type === "stok") {
    const meds = await db.medicine.findMany({ where: { isActive: true }, include: { inventory: true } });
    const kritisSetting = await db.applicationSetting.findUnique({ where: { key: "inventory.kritisFactor" } });
    const kritisFactor = Number(kritisSetting?.value ?? "0.8");
    const { computeStockStatus } = await import("@/lib/inventory-status");
    const rows = meds.map((m) => {
      const st = computeStockStatus(m.inventory?.stockSystem ?? 0, m.minStock, kritisFactor);
      return [m.name, m.inventory?.stockSystem ?? 0, m.inventory?.stockPhysical ?? 0,
        (m.inventory?.stockPhysical ?? 0) - (m.inventory?.stockSystem ?? 0), m.minStock, st.label];
    });
    const counts = { Aman: 0, "Perlu Perhatian": 0, Kritis: 0 };
    for (const r of rows) counts[r[5] as keyof typeof counts]++;
    return ok({
      ...base,
      summary: [
        ["Jenis Obat", `${meds.length}`],
        ["Total Stok Sistem", `${rows.reduce((s, r) => s + (r[1] as number), 0).toLocaleString("id-ID")} unit`],
        ["Selisih Opname", `${rows.reduce((s, r) => s + (r[3] as number), 0)} unit`],
        ["Status", `${counts.Aman} aman / ${counts["Perlu Perhatian"]} perhatian / ${counts.Kritis} kritis`],
      ],
      table: {
        title: "Posisi Persediaan (stock opname terakhir)",
        headers: ["Nama Obat", "Stok Sistem", "Stok Fisik", "Selisih", "Minimum", "Status"],
        rows,
        note: `Aturan status: Aman >= minimum; Kritis < ${kritisFactor} x minimum (dapat dikonfigurasi).`,
      },
      insight: [
        "Stok fisik berasal dari penghitungan stock opname terakhir per obat.",
        "Selisih negatif menandakan stok fisik lebih sedikit dari catatan sistem.",
        "Periksa obat berstatus Kritis/Perlu Perhatian pada menu Rekomendasi Pengadaan.",
      ],
      exportRows: { headers: ["Nama Obat", "Stok Sistem", "Stok Fisik", "Selisih", "Minimum", "Status"], rows },
    });
  }

  // pengadaan
  const rec = await db.procurementRecommendation.findFirst({
    where: { status: { not: "DIBATALKAN" } },
    orderBy: { createdAt: "desc" },
    include: { items: { include: { medicine: { select: { name: true, unit: true } } } } },
  });
  if (!rec) {
    return ok({
      ...base,
      summary: [["Status", "Belum ada rekomendasi aktif"]],
      table: { title: "Rekomendasi Pengadaan", headers: ["Keterangan"], rows: [["Belum ada rekomendasi. Buat terlebih dahulu pada menu Rekomendasi Pengadaan."]] },
      insight: ["Buat rekomendasi pengadaan dari hasil prediksi permintaan dan posisi stok terkini."],
      exportRows: { headers: ["Keterangan"], rows: [["Belum ada rekomendasi"]] },
    });
  }
  const rows = rec.items.map((it) => [
    it.medicine.name, it.currentStock, Math.round(it.forecastDemand), Math.round(it.safetyStock),
    it.recommendedQty, it.urgency, rupiah(it.lineTotal),
  ]);
  const urgencyCount = rec.items.filter((it) => it.urgency === "TINGGI" || it.urgency === "KRITIS").length;
  return ok({
    ...base,
    summary: [
      ["Kode Rekomendasi", rec.code],
      ["Total Rekomendasi", rupiah(rec.totalAmount)],
      ["Obat Prioritas", `${urgencyCount} obat`],
      ["Status", rec.status === "DISETPUJUI" ? "Disetujui" : "Draf"],
    ],
    table: {
      title: "Daftar Pengadaan yang Direkomendasikan",
      headers: ["Nama Obat", "Stok", "Prakiraan", "Stok Pengaman", "Jumlah Beli", "Urgensi", "Nilai"],
      rows,
      note: rec.coverageNote ?? undefined,
    },
    insight: [
      "Perhitungan: kebutuhan bersih = prakiraan permintaan + stok pengaman - stok tersedia.",
      "Jumlah pembelian dibulatkan mengikuti satuan pembelian setiap obat.",
      "Keputusan akhir tetap pada manajemen dengan mempertimbangkan anggaran dan waktu tunggu pemasok.",
    ],
    exportRows: { headers: ["Nama Obat", "Stok", "Prakiraan", "Stok Pengaman", "Jumlah Beli", "Urgensi", "Nilai"], rows },
  });
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function avg(arr: number[]): string {
  return arr.length ? (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1) : "-";
}
