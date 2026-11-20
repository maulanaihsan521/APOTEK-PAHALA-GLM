/**
 * Jembatan Next.js <-> Pipeline Machine Learning (Python/scikit-learn)
 * Menjalankan ml/pipeline.py dan menyimpan hasilnya ke database via Prisma.
 */
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const execFileAsync = promisify(execFile);
const PROJECT = process.cwd();
const PY = process.env.PYTHON_BIN || "python3";
const PIPELINE = path.join(PROJECT, "ml", "pipeline.py");
const DB_FILE = path.join(PROJECT, "db", "custom.db");
const OUT_DIR = path.join(PROJECT, "storage", "ml");

interface TrainPayload {
  ok: boolean;
  trainedAt: string;
  evaluations: {
    medicineId: string;
    modelName: string;
    mae: number | null;
    rmse: number | null;
    mape: number | null;
    trainWeeks: number;
    testWeeks: number;
    note?: string;
  }[];
  testPredictions: {
    medicineId: string;
    modelName: string;
    weekStart: string;
    actual: number;
    predicted: number;
  }[];
  importances: Record<string, Record<string, number>>;
  meta: Record<string, { nWeeks: number; firstWeek: string; lastWeek: string; rf: { mae: number; rmse: number; mape: number } }>;
  params: { nEstimators: number; maxDepth: number | null; randomState: number; testSplit: number; useWeather: boolean };
}

export async function runTraining(opts?: { nEstimators?: number; maxDepth?: number | null; randomState?: number; testSplit?: number; useWeather?: boolean }) {
  const args = [
    PIPELINE, "train",
    "--db", DB_FILE,
    "--out", OUT_DIR,
    "--n-estimators", String(opts?.nEstimators ?? 400),
    "--max-depth", opts?.maxDepth ? String(opts.maxDepth) : "",
    "--random-state", String(opts?.randomState ?? 42),
    "--test-split", String(opts?.testSplit ?? 0.2),
    "--use-weather", opts?.useWeather === false ? "0" : "1",
  ];
  const { stdout } = await execFileAsync(PY, args, { timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  const result = JSON.parse(stdout.trim().split("\n").pop() || "{}");
  if (!result.ok) throw new Error(result.error || "Training gagal");
  const payload: TrainPayload = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "train_result.json"), "utf8"));
  await persistTrainResult(payload);
  return result;
}

async function persistTrainResult(payload: TrainPayload) {
  await db.$transaction(async (tx) => {
    await tx.modelEvaluation.deleteMany();
    await tx.testPrediction.deleteMany();
    const rows = payload.evaluations
      .filter((e) => e.mae !== null)
      .map((e) => ({
        medicineId: e.medicineId,
        modelName: e.modelName,
        mae: e.mae!, rmse: e.rmse!, mape: e.mape!,
        trainWeeks: e.trainWeeks, testWeeks: e.testWeeks,
        weatherUsed: payload.params.useWeather,
        nEstimators: e.modelName === "Random Forest Regression" ? payload.params.nEstimators : null,
        maxDepth: payload.params.maxDepth,
        params: JSON.stringify(payload.params),
      }));
    if (rows.length) await tx.modelEvaluation.createMany({ data: rows });
    if (payload.testPredictions.length) {
      await tx.testPrediction.createMany({ data: payload.testPredictions });
    }
    await tx.applicationSetting.upsert({
      where: { key: "model.trainedAt" },
      update: { value: payload.trainedAt },
      create: { key: "model.trainedAt", value: payload.trainedAt },
    });
    await tx.applicationSetting.upsert({
      where: { key: "model.params" },
      update: { value: JSON.stringify(payload.params) },
      create: { key: "model.params", value: JSON.stringify(payload.params) },
    });
    await tx.applicationSetting.upsert({
      where: { key: "model.featureImportance" },
      update: { value: JSON.stringify(payload.importances) },
      create: { key: "model.featureImportance", value: JSON.stringify(payload.importances) },
    });
    await tx.applicationSetting.upsert({
      where: { key: "model.dataCoverage" },
      update: { value: JSON.stringify(payload.meta) },
      create: { key: "model.dataCoverage", value: JSON.stringify(payload.meta) },
    });
  });
}

export interface ForecastPayload {
  ok: boolean;
  medicineId: string;
  periodWeeks: number;
  startDate: string;
  avgDemand: number;
  nextWeekDemand: number;
  trend: string;
  mae: number | null; rmse: number | null; mape: number | null;
  results: { weekNumber: number; weekStart: string; predicted: number; temp: number; rain: number; rh: number }[];
  scenarioNote: string;
  featureNote: string;
  history12: { weekStart: string; actual: number }[];
  generatedAt: string;
}

export type PersistedRun = Prisma.PredictionRunGetPayload<{ include: { results: true; medicine: true } }>;

export async function runForecast(medicineId: string, weeks: number, createdBy: string, persist?: true): Promise<PersistedRun>;
export async function runForecast(medicineId: string, weeks: number, createdBy: string, persist: false): Promise<ForecastPayload>;
export async function runForecast(medicineId: string, weeks: number, createdBy: string, persist = true) {
  const med = await db.medicine.findUnique({ where: { id: medicineId } });
  if (!med) throw new Error("Obat tidak ditemukan");
  const args = [
    PIPELINE, "predict",
    "--db", DB_FILE, "--out", OUT_DIR,
    "--medicine", med.code, "--weeks", String(weeks),
  ];
  const { stdout } = await execFileAsync(PY, args, { timeout: 120000, maxBuffer: 32 * 1024 * 1024 });
  const result = JSON.parse(stdout.trim().split("\n").pop() || "{}");
  if (!result.ok) throw new Error(result.error || "Prediksi gagal");
  const payload: ForecastPayload = JSON.parse(
    fs.readFileSync(path.join(OUT_DIR, `forecast_${med.code}_${weeks}.json`), "utf8")
  );
  if (!persist) return payload;

  const run = await db.predictionRun.create({
    data: {
      medicineId, modelName: "Random Forest Regression", periodWeeks: weeks,
      startDate: new Date(payload.startDate), status: "SELESAI",
      avgDemand: payload.avgDemand, nextWeekDemand: payload.nextWeekDemand,
      trend: payload.trend, mae: payload.mae, rmse: payload.rmse, mape: payload.mape,
      featureNote: payload.featureNote, scenarioNote: payload.scenarioNote,
      createdBy,
      results: {
        create: payload.results.map((r) => ({
          weekNumber: r.weekNumber, weekStart: new Date(r.weekStart), predicted: r.predicted,
        })),
      },
    },
    include: { results: true, medicine: true },
  });
  await db.activityLog.create({
    data: { userName: createdBy, type: "PREDIKSI", message: `Prediksi permintaan ${med.name} ${weeks} pekan berhasil dijalankan`, objectRef: run.id },
  });
  return run;
}
