import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";
import { runTraining, runForecast } from "@/lib/ml";

/** Status model (GET) dan training model (POST, khusus Admin). */
export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const [evaluations, settings, runs, medCount] = await Promise.all([
    db.modelEvaluation.findMany({ include: { medicine: { select: { name: true, code: true } } }, orderBy: [{ medicineId: "asc" }, { modelName: "asc" }] }),
    db.applicationSetting.findMany(),
    db.predictionRun.findMany({ orderBy: { createdAt: "desc" }, take: 15, include: { medicine: { select: { name: true } } } }),
    db.medicine.count({ where: { isActive: true } }),
  ]);
  const s = Object.fromEntries(settings.map((x) => [x.key, x.value]));
  const rf = evaluations.filter((e) => e.modelName === "Random Forest Regression" && e.mae !== null);
  const avgMape = rf.length ? rf.reduce((a, e) => a + e.mape, 0) / rf.length : null;
  const modelsFile = await db.applicationSetting.findUnique({ where: { key: "model.trainedAt" } });

  let importance: Record<string, Record<string, number>> | null = null;
  try {
    const raw = s["model.featureImportance"];
    if (raw) importance = JSON.parse(raw);
  } catch {}

  return ok({
    settings: {
      modelName: s["model.name"] ?? "Random Forest Regression",
      nEstimators: Number(s["model.nEstimators"] ?? 400),
      maxDepth: s["model.maxDepth"] ? Number(s["model.maxDepth"]) : null,
      randomState: Number(s["model.randomState"] ?? 42),
      testSplit: Number(s["model.testSplit"] ?? 0.2),
      useWeather: (s["model.useWeather"] ?? "true") === "true",
    },
    status: {
      trainedAt: modelsFile?.value ?? null,
      dataCoverage: s["model.dataCoverage"] ? JSON.parse(s["model.dataCoverage"]) : null,
      avgMape: avgMape !== null ? Math.round(avgMape * 10) / 10 : null,
      accuracy: avgMape !== null ? Math.round((100 - avgMape) * 10) / 10 : null,
      featureImportance: importance,
      medicineCount: medCount,
      modelFiles: rf.length,
    },
    evaluations: evaluations.filter((e) => e.mae !== null).map((e) => ({
      id: e.id, medicineName: e.medicine.name, medicineCode: e.medicine.code,
      modelName: e.modelName, mae: e.mae, rmse: e.rmse, mape: e.mape,
      trainWeeks: e.trainWeeks, testWeeks: e.testWeeks, weatherUsed: e.weatherUsed,
      nEstimators: e.nEstimators, trainedAt: e.trainedAt,
    })),
    recentRuns: runs.map((r) => ({ id: r.id, medicineName: r.medicine.name, periodWeeks: r.periodWeeks, createdAt: r.createdAt, avgDemand: r.avgDemand, trend: r.trend })),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ nEstimators?: number; maxDepth?: number | null; randomState?: number; testSplit?: number; useWeather?: boolean; persistSettings?: boolean }>(req);

  const nEstimators = body?.nEstimators !== undefined ? Math.max(10, Math.min(2000, Math.round(body.nEstimators))) : undefined;
  const maxDepth = body?.maxDepth !== undefined && body.maxDepth !== null ? Math.max(2, Math.min(100, Math.round(body.maxDepth))) : null;
  const randomState = body?.randomState !== undefined ? Math.max(0, Math.min(999999, Math.round(body.randomState))) : undefined;
  const testSplit = body?.testSplit !== undefined ? Math.max(0.1, Math.min(0.5, body.testSplit)) : undefined;
  const useWeather = body?.useWeather !== undefined ? body.useWeather : undefined;

  try {
    const result = await runTraining({ nEstimators, maxDepth, randomState, testSplit, useWeather });
    if (body?.persistSettings !== false) {
      const set = await db.applicationSetting;
      const updates: { key: string; value: string }[] = [];
      if (nEstimators !== undefined) updates.push({ key: "model.nEstimators", value: String(nEstimators) });
      if (maxDepth !== undefined) updates.push({ key: "model.maxDepth", value: maxDepth ? String(maxDepth) : "" });
      if (randomState !== undefined) updates.push({ key: "model.randomState", value: String(randomState) });
      if (testSplit !== undefined) updates.push({ key: "model.testSplit", value: String(testSplit) });
      if (useWeather !== undefined) updates.push({ key: "model.useWeather", value: String(useWeather) });
      for (const u of updates) {
        await set.upsert({ where: { key: u.key }, update: { value: u.value }, create: u });
      }
    }
    // prakiraan awal 4 pekan untuk seluruh obat agar dashboard & pengadaan siap pakai
    const meds = await db.medicine.findMany({ where: { isActive: true }, select: { id: true } });
    let forecasts = 0;
    for (const m of meds) {
      try {
        await runForecast(m.id, 4, auth.user.name, true);
        forecasts++;
      } catch {}
    }
    await logActivity(auth.user.name, "MODEL", `Training model selesai (RF ${nEstimators ?? 400} pohon) — MAPE rata-rata ${result.avgMape ?? "-"}%`);
    return ok({ ok: true, result, forecastsGenerated: forecasts });
  } catch (e) {
    const err = (e as Error).message;
    await logActivity(auth.user.name, "MODEL", `Training model gagal: ${err.slice(0, 120)}`);
    return fail(`Training gagal: ${err}`, 500);
  }
}
