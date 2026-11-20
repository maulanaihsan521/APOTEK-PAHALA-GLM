/**
 * Impor data penjualan: pratinjau + validasi, lalu commit.
 * Body: { format: "csv"|"xlsx", content: string (teks CSV / base64 XLSX), mode: "preview"|"commit", mappings? }
 * Kolom yang dikenali: tanggal, kode_obat, nama_obat, jumlah, harga_satuan, mutasi
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

const COLUMN_ALIASES: Record<string, string[]> = {
  tanggal: ["tanggal", "date", "tgl", "tanggaltransaksi"],
  kodeObat: ["kodeobat", "kode", "kodebarang", "blkodebr", "code"],
  namaObat: ["namaobat", "nama", "namabarang", "obat", "medicine"],
  jumlah: ["jumlah", "kuantitas", "qty", "quantity", "jml"],
  hargaSatuan: ["hargasatuan", "harga", "price", "hargajual"],
  mutasi: ["mutasi", "kodemetasi", "mutation", "type"],
};

async function readXlsx(base64: string): Promise<string[][]> {
  const tmp = path.join(os.tmpdir(), `ap_import_${Date.now()}.xlsx`);
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
  const auth = await requireUser(["Admin", "Petugas"]);
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
    for (const alias of COLUMN_ALIASES[key]) {
      const i = header.indexOf(alias);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iTgl = idx("tanggal"), iKode = idx("kodeObat"), iNama = idx("namaObat"), iJml = idx("jumlah"), iHarga = idx("hargaSatuan"), iMut = idx("mutasi");
  if (iTgl < 0 || iJml < 0) {
    return fail("Kolom wajib 'tanggal' dan 'jumlah' tidak ditemukan pada baris judul. Gunakan template impor yang disediakan.", 422, "MAPPING");
  }

  const medicines = await db.medicine.findMany({ where: { isActive: true } });
  const byCode = new Map(medicines.map((m) => [m.code.toLowerCase(), m]));
  const byName = new Map(medicines.map((m) => [m.name.toLowerCase(), m]));

  const valid: { date: Date; medicineId: string; quantity: number; unitPrice: number; totalPrice: number; mutation: string }[] = [];
  const errors: { row: number; message: string }[] = [];
  let skipped = 0;

  for (let r = 1; r < raw.length; r++) {
    const row = raw[r];
    const rowNum = r + 1;
    const tgl = row[iTgl]?.trim();
    if (!tgl) { errors.push({ row: rowNum, message: "Tanggal kosong" }); continue; }
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(tgl) ? `${tgl}T00:00:00.000Z` : tgl);
    if (isNaN(d.getTime())) { errors.push({ row: rowNum, message: `Tanggal tidak valid: "${tgl}"` }); continue; }
    const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
    if (d.getTime() > endOfToday.getTime()) { errors.push({ row: rowNum, message: `Tanggal masa depan tidak diizinkan: "${tgl}"` }); continue; }
    const qtyRaw = Number(String(row[iJml]).replace(",", "."));
    if (!isFinite(qtyRaw) || qtyRaw === 0) { errors.push({ row: rowNum, message: `Jumlah tidak valid (harus angka, bukan nol): "${row[iJml]}"` }); continue; }
    const harga = iHarga >= 0 ? Number(String(row[iHarga]).replace(/[^\d]/g, "")) : 0;
    if (iHarga >= 0 && (!isFinite(harga) || harga < 0)) { errors.push({ row: rowNum, message: `Harga tidak boleh negatif` }); continue; }
    const mut = (iMut >= 0 ? String(row[iMut]).trim().toUpperCase() : "P") === "R" ? "R" : "P";
    let quantity = Math.round(qtyRaw);
    if (mut === "R" && quantity > 0) quantity = -quantity;
    if (mut === "P" && quantity < 0) { errors.push({ row: rowNum, message: "Mutasi P (penjualan) tidak boleh negatif — gunakan mutasi R" }); continue; }

    let med: (typeof medicines)[number] | undefined;
    if (iKode >= 0 && row[iKode]?.trim()) med = byCode.get(row[iKode].trim().toLowerCase());
    if (!med && iNama >= 0 && row[iNama]?.trim()) med = byName.get(row[iNama].trim().toLowerCase());
    if (!med) {
      errors.push({ row: rowNum, message: `Obat tidak terdaftar: "${row[iKode] || row[iNama] || "??"}". Daftarkan obat terlebih dahulu.` });
      continue;
    }
    valid.push({ date: d, medicineId: med.id, quantity, unitPrice: harga || med.basePrice, totalPrice: (harga || med.basePrice) * quantity, mutation: mut });
  }

  // deteksi duplikasi (tanggal + obat + jumlah + harga + mutasi)
  const existing = await db.sale.findMany({
    where: valid.length ? { date: { gte: new Date(Math.min(...valid.map((v) => v.date.getTime()))) } } : {},
    select: { date: true, medicineId: true, quantity: true, unitPrice: true, mutation: true },
  });
  const existKeys = new Set(existing.map((e) => `${e.date.toISOString().slice(0, 10)}|${e.medicineId}|${e.quantity}|${e.unitPrice}|${e.mutation}`));
  const finalRows = valid.filter((v) => {
    const key = `${v.date.toISOString().slice(0, 10)}|${v.medicineId}|${v.quantity}|${v.unitPrice}|${v.mutation}`;
    if (existKeys.has(key)) { skipped++; return false; }
    return true;
  });

  if (mode === "preview") {
    return ok({
      mode, totalRows: raw.length - 1,
      validCount: finalRows.length, skipped, errorCount: errors.length,
      errors: errors.slice(0, 30),
      preview: finalRows.slice(0, 15).map((v) => ({
        tanggal: v.date.toISOString().slice(0, 10),
        obat: medicines.find((m) => m.id === v.medicineId)?.name,
        jumlah: v.quantity, harga: v.unitPrice, total: v.totalPrice, mutasi: v.mutation,
      })),
    });
  }

  // commit
  for (let c = 0; c < finalRows.length; c += 500) {
    await db.sale.createMany({
      data: finalRows.slice(c, c + 500).map((v) => ({ ...v, source: "IMPORT", createdBy: auth.user.name })),
    });
  }
  await logActivity(auth.user.name, "IMPORT", `Impor data penjualan: ${finalRows.length} baris berhasil, ${skipped} duplikat dilewati, ${errors.length} baris gagal`);
  return ok({ mode, inserted: finalRows.length, skipped, errorCount: errors.length, errors: errors.slice(0, 30) });
}
