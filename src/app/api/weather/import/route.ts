/**
 * Impor data cuaca: pratinjau + validasi, lalu commit (upsert per tanggal).
 * Kolom: tanggal, suhu_c, curah_hujan_mm, kelembapan
 */
import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === "," || c === ";" || c === "\t") { cur.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      cur.push(field); field = ""; rows.push(cur); cur = [];
    } else field += c;
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

function normKey(s: string): string {
  return s.toLowerCase().replace(/[\s_]+/g, "").replace(/[^a-z]/g, "");
}

const ALIASES: Record<string, string[]> = {
  tanggal: ["tanggal", "date", "tgl"],
  suhu: ["suhuc", "suhu", "temperature", "temp", "suhuratarata"],
  hujan: ["curahhujanmm", "curahhujan", "hujan", "rain", "rainfall", "prcp"],
  kelembapan: ["kelembapan", "kelembaban", "humidity", "rh", "rh2m"],
};

async function readXlsx(base64: string): Promise<string[][]> {
  const tmp = path.join(os.tmpdir(), `ap_weather_${Date.now()}.xlsx`);
  fs.writeFileSync(tmp, Buffer.from(base64, "base64"));
  try {
    const { stdout } = await execFileAsync("python3", [path.join(process.cwd(), "ml", "io_xlsx.py"), "read", "--file", tmp], { timeout: 60000 });
    const parsed = JSON.parse(stdout.trim().split("\n").pop() || "{}");
    return parsed.rows as string[][];
  } finally {
    fs.unlinkSync(tmp);
  }
}

export async function POST(req: Request) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ format?: string; content?: string; mode?: string }>(req);
  if (!body?.content) return fail("Berkas atau data tidak terbaca.");
  const mode = body.mode === "commit" ? "commit" : "preview";

  let raw: string[][];
  try {
    raw = body.format === "xlsx" ? await readXlsx(body.content) : parseCSV(body.content);
  } catch {
    return fail("Berkas tidak dapat dibaca. Pastikan format CSV atau Excel (.xlsx) valid.", 422);
  }
  if (raw.length < 2) return fail("Berkas kosong atau hanya berisi judul kolom.");

  const header = raw[0].map(normKey);
  const idx = (key: string) => {
    for (const alias of ALIASES[key]) {
      const i = header.indexOf(alias);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTgl = idx("tanggal"), iSuhu = idx("suhu"), iHujan = idx("hujan"), iRh = idx("kelembapan");
  if (iTgl < 0 || iSuhu < 0 || iHujan < 0 || iRh < 0) {
    return fail("Kolom wajib tidak ditemukan. Gunakan kolom: tanggal, suhu_c, curah_hujan_mm, kelembapan.", 422, "MAPPING");
  }

  const valid: { date: Date; temperature: number; rainfall: number; humidity: number }[] = [];
  const errors: { row: number; message: string }[] = [];
  for (let r = 1; r < raw.length; r++) {
    const row = raw[r];
    const rowNum = r + 1;
    const tgl = row[iTgl]?.trim();
    if (!tgl) { errors.push({ row: rowNum, message: "Tanggal kosong" }); continue; }
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(tgl) ? `${tgl}T00:00:00.000Z` : tgl);
    if (isNaN(d.getTime())) { errors.push({ row: rowNum, message: `Tanggal tidak valid: "${tgl}"` }); continue; }
    const temp = Number(String(row[iSuhu]).replace(",", "."));
    const rain = Number(String(row[iHujan]).replace(",", "."));
    const rh = Number(String(row[iRh]).replace(",", "."));
    if (!isFinite(temp) || temp < -10 || temp > 60) { errors.push({ row: rowNum, message: `Suhu tidak wajar: "${row[iSuhu]}"` }); continue; }
    if (!isFinite(rain) || rain < 0) { errors.push({ row: rowNum, message: `Curah hujan tidak boleh negatif` }); continue; }
    if (!isFinite(rh) || rh < 0 || rh > 100) { errors.push({ row: rowNum, message: `Kelembapan harus 0-100%` }); continue; }
    valid.push({ date: d, temperature: Math.round(temp * 10) / 10, rainfall: Math.round(rain * 10) / 10, humidity: Math.round(rh) });
  }

  if (mode === "preview") {
    return ok({
      mode, totalRows: raw.length - 1, validCount: valid.length, errorCount: errors.length,
      errors: errors.slice(0, 30),
      preview: valid.slice(0, 15).map((v) => ({ tanggal: v.date.toISOString().slice(0, 10), suhu: v.temperature, hujan: v.rainfall, kelembapan: v.humidity })),
    });
  }

  let inserted = 0;
  for (const v of valid) {
    await db.weatherData.upsert({
      where: { date: v.date },
      update: { temperature: v.temperature, rainfall: v.rainfall, humidity: v.humidity },
      create: { ...v, source: "IMPORT" },
    });
    inserted++;
  }
  await logActivity(auth.user.name, "IMPORT", `Impor data cuaca: ${inserted} hari diperbarui, ${errors.length} baris gagal`);
  return ok({ mode, inserted, errorCount: errors.length, errors: errors.slice(0, 30) });
}
