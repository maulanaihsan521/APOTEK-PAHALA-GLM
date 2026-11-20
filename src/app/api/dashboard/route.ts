import { db } from "@/lib/db";
import { ok, requireUser, parseDate, formatCompactJt } from "@/lib/api";
import { computeStockStatus } from "@/lib/inventory-status";

function pctDelta(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return ((cur - prev) / prev) * 100;
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get("from"), new Date("2025-01-01T00:00:00.000Z"))!;
  const to = parseDate(url.searchParams.get("to"), new Date("2025-01-31T00:00:00.000Z"))!;
  const range = Number(url.searchParams.get("range") || 4); // pekan utk grafik tren

  const spanDays = Math.max(1, Math.round((to.getTime() + 86399999 - from.getTime()) / 86400000));
  const toExcl = new Date(from.getTime() + spanDays * 86400000); // eksklusif = awal hari berikutnya
  const prevFrom = new Date(from.getTime() - spanDays * 86400000); // periode pembanding sama panjang

  const [curAgg, prevAgg, medicines, kritisSetting, evaluations, recentRuns, trendLogs] = await Promise.all([
    db.sale.aggregate({ where: { date: { gte: from, lt: toExcl } }, _sum: { quantity: true, totalPrice: true } }),
    db.sale.aggregate({ where: { date: { gte: prevFrom, lt: from } }, _sum: { quantity: true, totalPrice: true } }),
    db.medicine.findMany({ where: { isActive: true }, include: { inventory: true }, orderBy: { name: "asc" } }),
    db.applicationSetting.findUnique({ where: { key: "inventory.kritisFactor" } }),
    db.modelEvaluation.findMany({ where: { modelName: "Random Forest Regression" } }),
    db.predictionRun.findMany({
      where: { medicine: { isActive: true } },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { medicine: true, results: { orderBy: { weekNumber: "asc" } } },
    }),
    db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 5 }),
  ]);

  const kritisFactor = Number(kritisSetting?.value ?? "0.8");

  // ---- Top 5 obat periode terpilih (neto P-R) ----
  const salesRows = await db.sale.findMany({
    where: { date: { gte: from, lt: toExcl } },
    select: { medicineId: true, quantity: true },
  });
  const netByMed = new Map<string, number>();
  for (const r of salesRows) netByMed.set(r.medicineId, (netByMed.get(r.medicineId) || 0) + r.quantity);
  const topMedicines = [...medicines]
    .map((m) => ({ m, net: netByMed.get(m.id) ?? 0 }))
    .sort((a, b) => b.net - a.net);

  // prediksi 4 pekan terakhir per obat (dari run terbaru)
  const latestRunByMed = new Map<string, typeof recentRuns[number]>();
  for (const run of recentRuns) if (!latestRunByMed.has(run.medicineId)) latestRunByMed.set(run.medicineId, run);

  const top5 = topMedicines.slice(0, 5).map(({ m, net }) => {
    const run = latestRunByMed.get(m.id);
    return {
      id: m.id, code: m.code, name: m.name,
      terjual: net,
      prediksi: run ? Math.round(run.results.reduce((s, r) => s + r.predicted, 0)) : null,
      spark: [] as number[], // diisi di bawah
    };
  });

  // sparkline 6 pekan terakhir per obat top-5
  if (top5.length) {
    const ids = top5.map((t) => t.id);
    const sparkRows = await db.sale.findMany({
      where: { medicineId: { in: ids }, date: { gte: new Date(Date.now() - 7 * 7 * 86400000) }, mutation: "P" },
      select: { medicineId: true, quantity: true, date: true },
    });
    const sparkMap = new Map<string, Map<string, number>>();
    for (const r of sparkRows) {
      const d = new Date(r.date);
      const dow = (d.getUTCDay() + 6) % 7;
      const ws = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
      const key = ws.toISOString().slice(0, 10);
      if (!sparkMap.has(r.medicineId)) sparkMap.set(r.medicineId, new Map());
      const wm = sparkMap.get(r.medicineId)!;
      wm.set(key, (wm.get(key) || 0) + r.quantity);
    }
    const keys = [...new Set([...sparkMap.values()].flatMap((m) => [...m.keys()]))].sort().slice(-6);
    for (const t of top5) {
      const wm = sparkMap.get(t.id);
      t.spark = wm ? keys.map((k) => wm.get(k) ?? 0) : [];
    }
  }

  // ---- Grafik tren (obat permintaan tertinggi) ----
  const focusMed = topMedicines[0]?.m ?? null;
  let trend: { label: string; weekStart: string; aktual: number | null; prediksi: number | null }[] = [];
  if (focusMed) {
    const weekly = await db.sale.groupBy({
      by: ["date"],
      where: { medicineId: focusMed.id, date: { gte: new Date(Date.now() - (range + 2) * 7 * 86400000) } },
      _sum: { quantity: true },
    });
    // agregasi manual per pekan (Senin)
    const byWeek = new Map<string, number>();
    for (const r of weekly) {
      const d = new Date(r.date);
      const dow = (d.getUTCDay() + 6) % 7;
      const ws = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
      const key = ws.toISOString().slice(0, 10);
      byWeek.set(key, (byWeek.get(key) || 0) + (r._sum.quantity || 0));
    }
    const weeks = [...byWeek.keys()].sort().slice(-(range + 2));
    const testPreds = await db.testPrediction.findMany({
      where: { medicineId: focusMed.id, modelName: "Random Forest Regression", weekStart: { in: weeks.map((w) => new Date(w + "T00:00:00.000Z")) } },
    });
    const predMap = new Map(testPreds.map((t) => [t.weekStart.toISOString().slice(0, 10), t.predicted]));
    trend = weeks.map((w, i) => ({
      label: `Minggu ${i + 1}`,
      weekStart: w,
      aktual: byWeek.get(w) ?? 0,
      prediksi: predMap.get(w) ?? null,
    }));
  }

  // ---- Ringkasan prediksi (run terbaru obat fokus) ----
  const focusRun = focusMed ? latestRunByMed.get(focusMed.id) : undefined;
  const ringkasanPrediksi = focusRun
    ? {
        medicineName: focusRun.medicine.name,
        periodWeeks: focusRun.periodWeeks,
        trend: focusRun.trend,
        nextWeekDemand: focusRun.nextWeekDemand,
        avgDemand: focusRun.avgDemand,
        weeks: focusRun.results.map((r) => ({ label: `Minggu ${r.weekNumber}`, value: Math.round(r.predicted) })),
        scenarioNote: focusRun.scenarioNote,
      }
    : null;

  // ---- Status stok ----
  const stockCounts = { AMAN: 0, PERLU_PERHATIAN: 0, KRITIS: 0 };
  for (const m of medicines) {
    const inv = m.inventory;
    const st = computeStockStatus(inv?.stockSystem ?? 0, m.minStock, kritisFactor);
    stockCounts[st.status]++;
  }
  const totalMed = medicines.length || 1;
  const stockStatus = [
    { status: "AMAN", label: "Aman", count: stockCounts.AMAN, pct: Math.round((stockCounts.AMAN / totalMed) * 100) },
    { status: "PERLU_PERHATIAN", label: "Perlu perhatian", count: stockCounts.PERLU_PERHATIAN, pct: Math.round((stockCounts.PERLU_PERHATIAN / totalMed) * 100) },
    { status: "KRITIS", label: "Kritis", count: stockCounts.KRITIS, pct: Math.round((stockCounts.KRITIS / totalMed) * 100) },
  ];

  // ---- MAPE model (rata-rata RF antar obat) ----
  const rfEvals = evaluations.filter((e) => e.mae !== null);
  const avgMape = rfEvals.length ? rfEvals.reduce((s, e) => s + e.mape, 0) / rfEvals.length : null;
  const testWeeks = rfEvals[0]?.testWeeks ?? null;

  const revenue = curAgg._sum.totalPrice ?? 0;
  const demand = curAgg._sum.quantity ?? 0;

  return ok({
    periode: { from: from.toISOString(), to: to.toISOString(), label: formatCompactJt(revenue) },
    kpi: {
      revenue,
      revenueLabel: formatCompactJt(revenue),
      revenueDeltaPct: pctDelta(revenue, prevAgg._sum.totalPrice ?? 0),
      demand,
      demandDeltaPct: pctDelta(demand, prevAgg._sum.quantity ?? 0),
      priorityCount: stockCounts.PERLU_PERHATIAN + stockCounts.KRITIS,
      priorityBreakdown: { perluPerhatian: stockCounts.PERLU_PERHATIAN, kritis: stockCounts.KRITIS },
      mape: avgMape !== null ? Math.round(avgMape * 10) / 10 : null,
      accuracy: avgMape !== null ? Math.round((100 - avgMape) * 10) / 10 : null,
      testWeeks,
    },
    focus: focusMed ? { id: focusMed.id, name: focusMed.name } : null,
    trend,
    ringkasanPrediksi,
    top5,
    stockStatus,
    activities: trendLogs.map((a) => ({ id: a.id, userName: a.userName, type: a.type, message: a.message, createdAt: a.createdAt })),
  });
}
