import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";
import { statSync, existsSync, mkdirSync, readdirSync, copyFileSync } from "fs";
import path from "path";

const BACKUP_DIR = path.join(process.cwd(), "backups");
const DB_FILE = path.join(process.cwd(), "db", "custom.db");

export async function GET() {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;

  const settings = await db.applicationSetting.findMany({ orderBy: { key: "asc" } });
  const counts = {
    medicines: await db.medicine.count(),
    sales: await db.sale.count(),
    weather: await db.weatherData.count(),
    users: await db.user.count(),
    predictionRuns: await db.predictionRun.count(),
    movements: await db.inventoryMovement.count(),
    activityLogs: await db.activityLog.count(),
  };
  let dbSize = 0;
  try { dbSize = statSync(DB_FILE).size; } catch {}

  const backups = existsSync(BACKUP_DIR)
    ? readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".db")).map((f) => {
        const st = statSync(path.join(BACKUP_DIR, f));
        return { file: f, size: st.size, createdAt: st.mtime };
      }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    : [];

  return ok({
    settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
    database: {
      location: DB_FILE, sizeBytes: dbSize, connected: true, counts,
      backups,
    },
    app: {
      name: "Apotek Pahala", subtitle: "Pharmacy Intelligence",
      version: "1.0.0", devYear: "2026",
      tech: "Next.js 16 (React 19, TypeScript, Tailwind) - Prisma/SQLite - FastAPI-style REST API - Python scikit-learn (Random Forest)",
      developer: "Capstone Design Project - S1 Sistem Informasi, Universitas Telkom Purwokerto",
      team: "2311103005 Naila Syakirotul Rizkiyah, 2311103029 Muhammad Rafly Adittana, 2311103015 Maulana Ihsan Rohim",
    },
  });
}

export async function PUT(req: Request) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<Record<string, string>>(req);
  if (!body || typeof body !== "object") return fail("Data pengaturan tidak valid.");

  const allowed = ["proc.safetyWeeks", "proc.coverageWeeks", "inventory.kritisFactor", "model.nEstimators", "model.maxDepth", "model.randomState", "model.testSplit", "model.useWeather"];
  for (const [key, value] of Object.entries(body)) {
    if (!allowed.includes(key)) continue;
    if (key === "model.nEstimators") {
      const n = Number(value);
      if (!isFinite(n) || n < 10 || n > 2000) return fail("Jumlah pohon harus angka 10 - 2000.");
    }
    if (key === "model.maxDepth" && value !== "") {
      const n = Number(value);
      if (!isFinite(n) || n < 2 || n > 100) return fail("Kedalaman maksimum harus angka 2 - 100 (kosongkan untuk tanpa batas).");
    }
    if (key === "model.randomState") {
      const n = Number(value);
      if (!isFinite(n) || n < 0) return fail("Random state harus angka >= 0.");
    }
    if (key === "model.testSplit") {
      const n = Number(value);
      if (!isFinite(n) || n < 0.1 || n > 0.5) return fail("Porsi data uji harus 0.1 - 0.5.");
    }
    if (key === "proc.safetyWeeks") {
      const n = Number(value);
      if (!isFinite(n) || n < 0 || n > 4) return fail("Stok pengaman harus 0 - 4 pekan.");
    }
    if (key === "inventory.kritisFactor") {
      const n = Number(value);
      if (!isFinite(n) || n <= 0 || n >= 1) return fail("Faktor kritis harus angka antara 0 dan 1 (mis. 0.8).");
    }
    await db.applicationSetting.upsert({ where: { key }, update: { value: String(value) }, create: { key, value: String(value) } });
  }
  await logActivity(auth.user.name, "SISTEM", "Pengaturan aplikasi disimpan");
  return ok({ ok: true });
}

export async function POST(req: Request) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ action?: string; file?: string }>(req);
  if (body?.action === "backup") {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const target = path.join(BACKUP_DIR, `backup-${stamp}.db`);
    copyFileSync(DB_FILE, target);
    await logActivity(auth.user.name, "SISTEM", `Backup database berhasil dibuat: ${path.basename(target)}`);
    return ok({ ok: true, file: path.basename(target) });
  }
  if (body?.action === "restore") {
    if (!body.file || body.file.includes("/") || body.file.includes("..")) return fail("Berkas backup tidak valid.");
    const src = path.join(BACKUP_DIR, body.file);
    if (!existsSync(src)) return fail("Berkas backup tidak ditemukan.", 404);
    // amankan db saat ini sebelum restore
    mkdirSync(BACKUP_DIR, { recursive: true });
    const pre = path.join(BACKUP_DIR, `pra-restore-${Date.now()}.db`);
    copyFileSync(DB_FILE, pre);
    copyFileSync(src, DB_FILE);
    await logActivity(auth.user.name, "SISTEM", `Database dipulihkan dari ${body.file}`);
    return ok({ ok: true });
  }
  return fail("Aksi tidak dikenali.");
}
