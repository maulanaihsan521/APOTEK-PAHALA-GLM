import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, nextMonday } from "@/lib/api";
import { runForecast } from "@/lib/ml";

/** Jalankan prediksi (POST) atau ambil hasil run terbaru (GET). */
export async function POST(req: Request) {
  const auth = await requireUser(["Admin", "Petugas"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ medicineId?: string; weeks?: number; startDate?: string }>(req);
  if (!body?.medicineId) return fail("Pilih obat terlebih dahulu.");
  const weeks = [1, 2, 4, 8, 12].includes(Number(body.weeks)) ? Number(body.weeks) : 4;

  const med = await db.medicine.findUnique({ where: { id: body.medicineId } });
  if (!med) return fail("Obat tidak ditemukan.", 404);

  try {
    const run = await runForecast(med.id, weeks, auth.user.name);
    return ok({
      run: {
        id: run.id,
        medicineId: med.id, medicineName: med.name, medicineUnit: med.unit,
        periodWeeks: run.periodWeeks,
        avgDemand: run.avgDemand, nextWeekDemand: run.nextWeekDemand, trend: run.trend,
        mae: run.mae, rmse: run.rmse, mape: run.mape,
        featureNote: run.featureNote, scenarioNote: run.scenarioNote,
        createdAt: run.createdAt,
        results: run.results
          .sort((a, b) => a.weekNumber - b.weekNumber)
          .map((r) => ({ weekNumber: r.weekNumber, weekStart: r.weekStart, predicted: r.predicted })),
        history12: [],
      },
    });
  } catch (e) {
    const err = (e as Error).message || "";
    if (err.includes("NO_MODEL")) {
      return fail("Model belum dilatih. Jalankan training model terlebih dahulu di menu Pengaturan.", 409, "NO_MODEL");
    }
    return fail(`Prediksi gagal: ${err}`, 500);
  }
}

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const medicineId = url.searchParams.get("medicineId");
  if (!medicineId) return fail("Parameter medicineId wajib.");
  const run = await db.predictionRun.findFirst({
    where: { medicineId, periodWeeks: Number(url.searchParams.get("weeks") || 4) },
    orderBy: { createdAt: "desc" },
    include: { medicine: true, results: { orderBy: { weekNumber: "asc" } } },
  });
  if (!run) return ok({ run: null });
  const startDate = run.startDate > new Date() ? run.startDate : nextMonday(new Date());
  return ok({
    run: {
      id: run.id,
      medicineId: run.medicineId, medicineName: run.medicine.name, medicineUnit: run.medicine.unit,
      periodWeeks: run.periodWeeks, avgDemand: run.avgDemand, nextWeekDemand: run.nextWeekDemand,
      trend: run.trend, mae: run.mae, rmse: run.rmse, mape: run.mape,
      featureNote: run.featureNote, scenarioNote: run.scenarioNote, createdAt: run.createdAt,
      results: run.results.map((r) => ({ weekNumber: r.weekNumber, weekStart: r.weekStart, predicted: r.predicted })),
      startDate,
    },
  });
}
