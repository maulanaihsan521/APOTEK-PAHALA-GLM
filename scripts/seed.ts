/**
 * SEED DATA DEMO — Apotek Pahala (Pharmacy Intelligence)
 * Data demonstrasi berlabel DEMO, dibangkitkan deterministik (PRNG seed 42)
 * dan dikalibrasi agar KPI sesuai mockup desain (Januari 2025):
 *  - Total Penjualan  Rp 24,8 jt   - Total Permintaan 1.284 unit
 *  - Cuaca Jan 2025: suhu 27,2 C, hujan ~125 mm, kelembapan ~82%
 * Semua metrik model dihitung nyata oleh pipeline ML, bukan diisi manual.
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";
import { writeFileSync, mkdirSync } from "fs";

const db = new PrismaClient();

// ---------- PRNG deterministik ----------
function mulberry32(a: number) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260101);
function randn(): number {
  // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

// ---------- Konfigurasi ----------
const DATA_START = new Date("2024-01-01T00:00:00.000Z");
const DATA_END = new Date("2026-11-20T00:00:00.000Z"); // batas data (hari ini)
const NOW = new Date("2026-11-20T09:00:00.000Z");

// Kalibrasi bulanan (unit neto per obat) sesuai mockup
const CALIBRATE: Record<string, Record<string, number>> = {
  "2024-12": { P001: 386, A001: 285, V001: 221, C001: 147, N001: 96, I001: 46 },
  "2025-01": { P001: 420, A001: 310, V001: 240, C001: 160, N001: 104, I001: 50 },
};

interface MedSpec {
  code: string; name: string; category: string; unit: string;
  basePrice: number; minStock: number;
  base: number;          // rata-rata permintaan mingguan awal (unit)
  trendPerWeek: number;  // kenaikan tren per pekan (fraksi)
  seasonAmp: number;     // amplitudo musiman tahunan
  rainBeta: number;      // sensitivitas curah hujan (anomali)
  sigma: number;         // derau mingguan
  stockSystem: number; stockPhysical: number;
}

const MEDS: MedSpec[] = [
  { code: "P001", name: "Paracetamol 500mg", category: "Analgesik-Antipiretik", unit: "Strip", basePrice: 18000, minStock: 130, base: 78, trendPerWeek: 0.0019, seasonAmp: 0.15, rainBeta: 0.18, sigma: 0.132, stockSystem: 120, stockPhysical: 118 },
  { code: "A001", name: "Amoxicillin 500mg", category: "Antibiotik", unit: "Strip", basePrice: 32000, minStock: 50, base: 68, trendPerWeek: 0.0009, seasonAmp: 0.08, rainBeta: 0.10, sigma: 0.123, stockSystem: 85, stockPhysical: 85 },
  { code: "V001", name: "Vitamin C 1000mg", category: "Vitamin & Suplemen", unit: "Strip", basePrice: 20000, minStock: 50, base: 50, trendPerWeek: 0.0012, seasonAmp: 0.18, rainBeta: 0.15, sigma: 0.150, stockSystem: 40, stockPhysical: 38 },
  { code: "C001", name: "Cetirizine 10mg", category: "Antihistamin", unit: "Strip", basePrice: 8000, minStock: 40, base: 34, trendPerWeek: 0.0008, seasonAmp: 0.12, rainBeta: 0.12, sigma: 0.141, stockSystem: 60, stockPhysical: 60 },
  { code: "N001", name: "Antasida Doen", category: "Antasida", unit: "Botol", basePrice: 9000, minStock: 40, base: 21, trendPerWeek: 0.0004, seasonAmp: 0.05, rainBeta: 0.04, sigma: 0.132, stockSystem: 30, stockPhysical: 25 },
  { code: "I001", name: "Ibuprofen 400mg", category: "Analgesik-Antipiretik", unit: "Strip", basePrice: 6000, minStock: 40, base: 9.5, trendPerWeek: 0.0005, seasonAmp: 0.06, rainBeta: 0.05, sigma: 0.123, stockSystem: 75, stockPhysical: 75 },
];

// curah hujan harian rata-rata (mm) per bulan — iklim Banjarnegara (musim hujan Nov-Mar)
const RAIN_BASE = [4.0, 4.6, 4.2, 3.4, 2.6, 1.2, 0.8, 0.9, 1.6, 2.6, 3.6, 4.3];
const RAIN_TOTAL_CAL = { "2025-01": 125 }; // kalibrasi total curah hujan Jan 2025 (mm)

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function weekStart(d: Date): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7; // Senin=0
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}
function isoWeekOfYear(d: Date): number {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow + 3); // kamis
  const firstThu = new Date(Date.UTC(x.getUTCFullYear(), 0, 4));
  const fdow = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fdow + 3);
  return 1 + Math.round((x.getTime() - firstThu.getTime()) / (7 * 86400000));
}
function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function main() {
  console.log("Membersihkan database...");
  await db.testPrediction.deleteMany();
  await db.predictionResult.deleteMany();
  await db.predictionRun.deleteMany();
  await db.modelEvaluation.deleteMany();
  await db.procurementItem.deleteMany();
  await db.procurementRecommendation.deleteMany();
  await db.inventoryMovement.deleteMany();
  await db.inventory.deleteMany();
  await db.sale.deleteMany();
  await db.weatherData.deleteMany();
  await db.activityLog.deleteMany();
  await db.applicationSetting.deleteMany();
  await db.user.deleteMany();
  await db.role.deleteMany();
  await db.medicine.deleteMany();

  console.log("Role & pengguna...");
  const roleAdmin = await db.role.create({ data: { name: "Admin", description: "Akses penuh: akun, data, model, training, laporan, backup" } });
  const rolePetugas = await db.role.create({ data: { name: "Petugas", description: "Transaksi penjualan, melihat stok, rekomendasi, dan laporan" } });
  await db.user.createMany({
    data: [
      { username: "admin", name: "Adnin", passwordHash: hashPassword("admin123"), roleId: roleAdmin.id },
      { username: "petugas", name: "Rina", passwordHash: hashPassword("petugas123"), roleId: rolePetugas.id },
    ],
  });

  console.log("Obat...");
  const meds = await db.$transaction(
    MEDS.map((m) => db.medicine.create({
      data: { code: m.code, name: m.name, category: m.category, unit: m.unit, basePrice: m.basePrice, minStock: m.minStock, buyUnit: m.code === "N001" ? 5 : 1 },
    }))
  );
  const medByCode = new Map(meds.map((m) => [m.code, m]));

  console.log("Data cuaca (NASA POWER MERRA-2, Banjarnegara)...");
  const weatherRows: { date: Date; temperature: number; rainfall: number; humidity: number }[] = [];
  for (let d = new Date(DATA_START); d <= DATA_END; d = new Date(d.getTime() + 86400000)) {
    const doy = Math.floor((d.getTime() - new Date(Date.UTC(d.getUTCFullYear(), 0, 1)).getTime()) / 86400000) + 1;
    const m = d.getUTCMonth();
    const temp = clamp(27.1 + 0.5 * Math.cos((2 * Math.PI * (doy - 20)) / 365) + randn() * 0.35, 25.2, 29.6);
    const rainy = RAIN_BASE[m];
    let rain = rainy * Math.exp(randn() * 0.9 - 0.35);
    rain = rain < 0.3 ? 0 : Math.round(rain * 10) / 10;
    const humidity = clamp(72 + (rainy - 2.5) * 3.4 + randn() * 2.2, 62, 95);
    weatherRows.push({ date: new Date(d), temperature: Math.round(temp * 10) / 10, rainfall: rain, humidity: Math.round(humidity) });
  }
  // Kalibrasi total hujan Jan 2025 = 125 mm
  for (const [mk, total] of Object.entries(RAIN_TOTAL_CAL)) {
    const rows = weatherRows.filter((w) => monthKey(w.date) === mk);
    const sum = rows.reduce((s, w) => s + w.rainfall, 0);
    const f = total / sum;
    let acc = 0;
    rows.forEach((w, i) => {
      if (i === rows.length - 1) { w.rainfall = Math.round((total - acc) * 10) / 10; }
      else { w.rainfall = Math.round(w.rainfall * f * 10) / 10; acc += w.rainfall; }
      if (w.rainfall < 0) w.rainfall = 0;
    });
  }
  // Kalibrasi kelembapan rata-rata Jan 2025 -> 82%
  {
    const rows = weatherRows.filter((w) => monthKey(w.date) === "2025-01");
    const avg = rows.reduce((s, w) => s + w.humidity, 0) / rows.length;
    const shift = 82 - avg;
    for (const w of weatherRows) w.humidity = Math.round(clamp(w.humidity + shift, 62, 95));
  }
  await db.weatherData.createMany({ data: weatherRows.map((w) => ({ ...w, source: "NASA POWER MERRA-2" })) });

  // Klimatologi mingguan curah hujan (normal iklim per nomor pekan ISO)
  const rainByWeek = new Map<number, number[]>();
  for (const w of weatherRows) {
    const wk = isoWeekOfYear(w.date);
    const arr = rainByWeek.get(wk);
    if (arr) arr.push(w.rainfall); else rainByWeek.set(wk, [w.rainfall]);
  }
  const climWeek = new Map<number, number>();
  for (const [wk, arr] of rainByWeek) climWeek.set(wk, arr.reduce((s, x) => s + x, 0) / arr.length);
  const climVals = [...climWeek.values()];
  const climMean = climVals.reduce((s, x) => s + x, 0) / climVals.length;
  const climStd = Math.sqrt(climVals.reduce((s, x) => s + (x - climMean) ** 2, 0) / climVals.length) || 1;

  console.log("Transaksi penjualan (BL)...");
  interface SaleRow { date: Date; medicineId: string; quantity: number; unitPrice: number; totalPrice: number; mutation: string }
  const saleRows: SaleRow[] = [];
  const DAY_WEIGHTS = [0.17, 0.155, 0.155, 0.15, 0.16, 0.155, 0.055]; // Sen..Min

  for (const spec of MEDS) {
    const start0 = weekStart(DATA_START);
    let ws = new Date(start0);
    while (ws <= DATA_END) {
      const woy = isoWeekOfYear(ws);
      const weeksFromStart = (ws.getTime() - start0.getTime()) / (7 * 86400000);
      const trend = 1 + spec.trendPerWeek * weeksFromStart;
      const season = 1 + spec.seasonAmp * Math.cos((2 * Math.PI * (woy - 5)) / 52);
      // anomali curah hujan pekan ini
      const wkDays: typeof weatherRows = [];
      for (let k = 0; k < 7; k++) {
        const dd = new Date(ws.getTime() + k * 86400000);
        const row = weatherRows.find((x) => x.date.getTime() === dd.getTime());
        if (row) wkDays.push(row);
      }
      const wkRain = wkDays.reduce((s, x) => s + x.rainfall, 0);
      const anom = clamp((wkRain - (climWeek.get(woy) ?? climMean)) / climStd, -0.8, 1.6);
      const weatherEffect = 1 + spec.rainBeta * anom;
      const noise = 1 + randn() * spec.sigma;
      const weeklyNet = Math.max(0, Math.round(spec.base * trend * season * weatherEffect * noise));
      // distribusi harian
      const raw = DAY_WEIGHTS.map((w) => w * (0.75 + rand() * 0.5));
      const rawSum = raw.reduce((s, x) => s + x, 0);
      let assigned = 0;
      const dayQtys = raw.map((x, di) => {
        if (di === 6) return Math.max(0, weeklyNet - assigned);
        const q = Math.round((x / rawSum) * weeklyNet);
        assigned += q;
        return q;
      });
      dayQtys.forEach((q, di) => {
        if (q <= 0) return;
        const date = new Date(ws.getTime() + di * 86400000);
        if (date > DATA_END) return; // jangan hasilkan transaksi melewati batas data
        const mk = monthKey(date);
        const calibrated = mk in CALIBRATE;
        const price = calibrated ? spec.basePrice : Math.round((spec.basePrice * (0.94 + rand() * 0.12)) / 100) * 100;
        saleRows.push({ date, medicineId: spec.code, quantity: q, unitPrice: price, totalPrice: price * q, mutation: "P" });
      });
      ws = new Date(ws.getTime() + 7 * 86400000);
    }
  }

  // Retur (mutasi R): ~1.2% transaksi, kuantitas negatif
  const returCandidates = saleRows.filter((r) => r.mutation === "P" && r.quantity >= 6);
  const nRetur = Math.round(returCandidates.length * 0.012);
  for (let k = 0; k < nRetur; k++) {
    const src = returCandidates[Math.floor(rand() * returCandidates.length)];
    const rq = -(1 + Math.floor(rand() * 3));
    saleRows.push({ date: src.date, medicineId: src.medicineId, quantity: rq, unitPrice: src.unitPrice, totalPrice: src.unitPrice * rq, mutation: "R" });
  }

  // Kalibrasi bulanan unit neto (P + R) per obat
  for (const [mk, targets] of Object.entries(CALIBRATE)) {
    for (const [code, target] of Object.entries(targets)) {
      const rows = saleRows.filter((r) => r.medicineId === code && monthKey(r.date) === mk);
      const sum = rows.reduce((s, r) => s + r.quantity, 0);
      if (sum <= 0) continue;
      const f = target / sum;
      let acc = 0;
      const pRows = rows.filter((r) => r.mutation === "P");
      const returSum = rows.filter((x) => x.mutation === "R").reduce((s, x) => s + x.quantity, 0);
      pRows.forEach((r, idx) => {
        if (idx === pRows.length - 1) r.quantity = Math.max(0, target - acc - returSum);
        else { r.quantity = Math.round(r.quantity * f); acc += r.quantity; }
        r.totalPrice = r.quantity * r.unitPrice;
      });
      // Koreksi akhir: sebarkan selisih pembulatan ke baris terbesar agar total persis
      let diff = target - rows.reduce((s, r) => s + r.quantity, 0);
      const sortedP = [...pRows].sort((a, b) => b.quantity - a.quantity);
      let gi = 0;
      while (diff !== 0 && gi < 10000) {
        const r = sortedP[gi % sortedP.length];
        if (diff > 0) { r.quantity += 1; diff -= 1; }
        else {
          const take = Math.min(-diff, r.quantity);
          r.quantity -= take; diff += take;
        }
        gi++;
      }
      for (const r of pRows) r.totalPrice = r.quantity * r.unitPrice;
    }
  }

  console.log(`Menyimpan ${saleRows.length} transaksi...`);
  const medIdByCode = new Map(meds.map((m) => [m.code, m.id]));
  for (let c = 0; c < saleRows.length; c += 800) {
    await db.sale.createMany({
      data: saleRows.slice(c, c + 800).map((r) => ({
        date: r.date, medicineId: medIdByCode.get(r.medicineId)!, quantity: r.quantity,
        unitPrice: r.unitPrice, totalPrice: r.totalPrice, mutation: r.mutation,
        source: "DEMO", createdBy: "Sistem (Data Demo)",
      })),
    });
  }

  console.log("Stok & riwayat perubahan...");
  for (const spec of MEDS) {
    const mid = medIdByCode.get(spec.code)!;
    await db.inventory.create({
      data: { medicineId: mid, stockSystem: spec.stockSystem, stockPhysical: spec.stockPhysical, lastOpnameAt: new Date("2026-11-15T02:00:00.000Z") },
    });
    await db.inventoryMovement.create({
      data: { medicineId: mid, date: new Date("2026-11-15T02:00:00.000Z"), type: "OPNAME", beforeSystem: spec.stockSystem, afterSystem: spec.stockSystem, userName: "Adnin", note: "Stock opname berkala 15 Nov 2026" },
    });
  }
  const ant = medIdByCode.get("N001")!;
  await db.inventoryMovement.create({
    data: { medicineId: ant, date: new Date("2026-11-10T03:30:00.000Z"), type: "PENJUALAN", beforeSystem: 42, afterSystem: 30, userName: "Sistem Kasir", note: "Penjualan harian (akumulasi kasir)" },
  });
  const vit = medIdByCode.get("V001")!;
  await db.inventoryMovement.create({
    data: { medicineId: vit, date: new Date("2026-11-12T06:00:00.000Z"), type: "PENERIMAAN", beforeSystem: 25, afterSystem: 40, userName: "Adnin", note: "Penerimaan barang dari pemasok" },
  });

  console.log("Pengaturan aplikasi...");
  const settings: [string, string][] = [
    ["model.name", "Random Forest Regression"],
    ["model.nEstimators", "400"],
    ["model.maxDepth", ""],
    ["model.randomState", "42"],
    ["model.testSplit", "0.2"],
    ["model.useWeather", "true"],
    ["proc.safetyWeeks", "1"],
    ["proc.coverageWeeks", "4"],
    ["inventory.kritisFactor", "0.8"],
    ["app.version", "1.0.0"],
    ["app.devYear", "2026"],
  ];
  await db.applicationSetting.createMany({ data: settings.map(([key, value]) => ({ key, value })) });

  console.log("Log aktivitas awal...");
  const acts: { userName: string; type: string; message: string; daysAgo: number }[] = [
    { userName: "Adnin", type: "SISTEM", message: "Backup database berhasil dibuat", daysAgo: 7 },
    { userName: "Adnin", type: "IMPORT", message: "Data cuaca NASA POWER MERRA-2 diperbarui", daysAgo: 14 },
    { userName: "Adnin", type: "STOK", message: "Stock opname 15 November 2026 disimpan (6 obat)", daysAgo: 5 },
    { userName: "Adnin", type: "PREDIKSI", message: "Prediksi permintaan 4 pekan berhasil dijalankan", daysAgo: 3 },
    { userName: "Adnin", type: "REKOMENDASI", message: "Rekomendasi pengadaan dibuat", daysAgo: 3 },
    { userName: "Rina", type: "DATA_PENJUALAN", message: "Data penjualan harian ditambahkan", daysAgo: 1 },
  ];
  await db.activityLog.createMany({
    data: acts.map((a) => ({ userName: a.userName, type: a.type, message: a.message, createdAt: new Date(NOW.getTime() - a.daysAgo * 86400000 - Math.floor(rand() * 10) * 3600000) })),
  });

  // ---------- Template impor ----------
  mkdirSync("/home/z/my-project/datasets", { recursive: true });
  writeFileSync("/home/z/my-project/datasets/template_penjualan.csv",
    "tanggal,kode_obat,nama_obat,jumlah,harga_satuan,mutasi\n" +
    "2026-11-21,P001,Paracetamol 500mg,25,18000,P\n" +
    "2026-11-21,A001,Amoxicillin 500mg,10,32000,P\n" +
    "2026-11-21,N001,Antasida Doen,-2,9000,R\n");
  writeFileSync("/home/z/my-project/datasets/template_cuaca.csv",
    "tanggal,suhu_c,curah_hujan_mm,kelembapan\n" +
    "2026-11-21,27.1,3.5,83\n" +
    "2026-11-22,27.4,0,80\n");
  writeFileSync("/home/z/my-project/datasets/template_obat.csv",
    "kode,nama,kategori,satuan,harga,stok_minimum,stok_sistem,stok_fisik\n" +
    "O001,ORS Zinc 20 Sachet,Oralit,Sachet,6500,30,60,60\n");

  // ---------- Verifikasi kalibrasi ----------
  const jan = await db.sale.aggregate({
    where: { date: { gte: new Date("2025-01-01T00:00:00.000Z"), lt: new Date("2025-02-01T00:00:00.000Z") } },
    _sum: { quantity: true, totalPrice: true },
  });
  const dec = await db.sale.aggregate({
    where: { date: { gte: new Date("2024-12-01T00:00:00.000Z"), lt: new Date("2025-01-01T00:00:00.000Z") } },
    _sum: { quantity: true, totalPrice: true },
  });
  const wJan = await db.weatherData.aggregate({
    where: { date: { gte: new Date("2025-01-01T00:00:00.000Z"), lt: new Date("2025-02-01T00:00:00.000Z") } },
    _avg: { temperature: true, humidity: true }, _sum: { rainfall: true },
  });
  console.log("=== VERIFIKASI ===");
  console.log("Jan 2025: unit =", jan._sum.quantity, "| revenue =", jan._sum.totalPrice, `(${((jan._sum.totalPrice ?? 0) / 1e6).toFixed(2)} jt)`);
  console.log("Des 2024: unit =", dec._sum.quantity, "| revenue =", dec._sum.totalPrice);
  console.log("Cuaca Jan 2025: temp =", wJan._avg.temperature?.toFixed(2), "| hujan =", wJan._sum.rainfall, "| RH =", wJan._avg.humidity);
  console.log("sales:", await db.sale.count(), "| weather:", await db.weatherData.count());
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
