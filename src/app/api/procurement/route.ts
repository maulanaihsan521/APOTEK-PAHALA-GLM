import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity, rupiah } from "@/lib/api";
import { computeUrgency } from "@/lib/inventory-status";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const [latest, history] = await Promise.all([
    db.procurementRecommendation.findFirst({
      where: { status: { not: "DIBATALKAN" } },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { medicine: { select: { name: true, unit: true, code: true } } }, orderBy: { lineTotal: "desc" } } },
    }),
    db.procurementRecommendation.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return ok({
    recommendation: latest
      ? {
          id: latest.id, code: latest.code, status: latest.status,
          periodWeeks: latest.periodWeeks, totalAmount: latest.totalAmount,
          safetyWeeks: latest.safetyWeeks, coverageNote: latest.coverageNote,
          createdAt: latest.createdAt, decidedAt: latest.decidedAt, createdBy: latest.createdBy,
          items: latest.items.map((it) => ({
            id: it.id, medicineId: it.medicineId, medicineName: it.medicine.name, medicineCode: it.medicine.code, unit: it.medicine.unit,
            currentStock: it.currentStock, forecastDemand: it.forecastDemand, minStock: it.minStock,
            safetyStock: it.safetyStock, recommendedQty: it.recommendedQty, adjustedQty: it.adjustedQty,
            finalQty: it.adjustedQty ?? it.recommendedQty,
            reason: it.reason, urgency: it.urgency, unitPrice: it.unitPrice, lineTotal: it.lineTotal,
          })),
        }
      : null,
    history: history.map((h) => ({
      id: h.id, code: h.code, status: h.status, totalAmount: h.totalAmount,
      itemCount: h._count.items, createdAt: h.createdAt, decidedAt: h.decidedAt, createdBy: h.createdBy,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(["Admin", "Petugas"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ weeks?: number }>(req);
  const periodWeeks = [1, 2, 4, 8].includes(Number(body?.weeks)) ? Number(body?.weeks) : 4;

  const [medicines, settingRows] = await Promise.all([
    db.medicine.findMany({ where: { isActive: true }, include: { inventory: true } }),
    db.applicationSetting.findMany(),
  ]);
  const s = Object.fromEntries(settingRows.map((x) => [x.key, x.value]));
  const safetyWeeks = Math.max(0, Math.min(4, Number(s["proc.safetyWeeks"] ?? 1)));
  const kritisFactor = Number(s["inventory.kritisFactor"] ?? 0.8);

  // gunakan run prediksi terbaru per obat; jalankan prediksi bila belum ada
  const items: {
    medicineId: string; currentStock: number; forecastDemand: number; minStock: number;
    safetyStock: number; recommendedQty: number; urgency: string; unitPrice: number; lineTotal: number;
  }[] = [];
  for (const m of medicines) {
    let run = await db.predictionRun.findFirst({ where: { medicineId: m.id }, orderBy: { createdAt: "desc" }, include: { results: true } });
    if (!run || run.results.length === 0) {
      try {
        const { runForecast } = await import("@/lib/ml");
        run = await runForecast(m.id, 4, "Sistem");
      } catch {
        return fail(`Prediksi untuk ${m.name} belum tersedia dan gagal dijalankan. Lakukan training model terlebih dahulu.`, 409, "NO_MODEL");
      }
    }
    const results = run.results.slice(0, periodWeeks);
    const forecastDemand = results.reduce((acc, r) => acc + r.predicted, 0);
    const weekly = forecastDemand / periodWeeks;
    const safetyStock = weekly * safetyWeeks;
    const currentStock = m.inventory?.stockSystem ?? 0;
    const kebutuhanBersih = forecastDemand + safetyStock - currentStock;
    const rawQty = Math.max(0, kebutuhanBersih);
    const recommendedQty = Math.ceil(rawQty / Math.max(1, m.buyUnit)) * Math.max(1, m.buyUnit);
    const urgency = computeUrgency(currentStock, forecastDemand, periodWeeks);
    items.push({
      medicineId: m.id, currentStock, forecastDemand: Math.round(forecastDemand * 10) / 10,
      minStock: m.minStock, safetyStock: Math.round(safetyStock * 10) / 10,
      recommendedQty, urgency, unitPrice: m.basePrice, lineTotal: recommendedQty * m.basePrice,
    });
  }

  const totalAmount = items.reduce((acc, it) => acc + it.lineTotal, 0);
  const now = new Date();
  const code = `RCM-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

  // batalkan rekomendasi DRAFT sebelumnya agar tidak menumpuk
  await db.procurementRecommendation.updateMany({ where: { status: "DRAFT" }, data: { status: "DIBATALKAN" } });

  const rec = await db.procurementRecommendation.create({
    data: {
      code, periodWeeks, status: "DRAFT", totalAmount, safetyWeeks,
      coverageNote: `Kebutuhan bersih = prakiraan ${periodWeeks} pekan + stok pengaman ${safetyWeeks} pekan - stok tersedia. Jumlah pembelian dibulatkan ke kelipatan satuan pembelian.`,
      createdBy: auth.user.name,
      items: { create: items },
    },
    include: { items: true },
  });
  await logActivity(auth.user.name, "REKOMENDASI", `Rekomendasi pengadaan ${code} dibuat (${items.length} obat, ${rupiah(totalAmount)})`, rec.id);
  return ok({ ok: true, id: rec.id, code, totalAmount });
}

export async function PATCH(req: Request) {
  const auth = await requireUser(["Admin", "Petugas"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ action?: string; id?: string; itemId?: string; adjustedQty?: number; reason?: string }>(req);
  if (!body?.action) return fail("Aksi tidak dikenali.");

  if (body.action === "adjust") {
    if (!body.itemId) return fail("Item tidak ditemukan.");
    const item = await db.procurementItem.findUnique({ where: { id: body.itemId }, include: { medicine: true } });
    if (!item) return fail("Item tidak ditemukan.", 404);
    const qty = Math.round(body.adjustedQty ?? 0);
    if (qty < 0) return fail("Jumlah pembelian tidak boleh negatif.");
    if (!body.reason?.trim()) return fail("Sertakan alasan perubahan jumlah pembelian.");
    await db.procurementItem.update({
      where: { id: item.id },
      data: { adjustedQty: qty, reason: body.reason.trim(), lineTotal: qty * item.unitPrice },
    });
    const rec = await db.procurementRecommendation.findUnique({ where: { id: item.recommendationId }, include: { items: true } });
    const total = rec ? rec.items.reduce((acc, it) => acc + (it.adjustedQty ?? it.recommendedQty) * it.unitPrice, 0) : 0;
    if (rec) await db.procurementRecommendation.update({ where: { id: rec.id }, data: { totalAmount: total } });
    await logActivity(auth.user.name, "REKOMENDASI", `Jumlah pembelian ${item.medicine.name} diubah menjadi ${qty} (${body.reason.trim()})`, item.id);
    return ok({ ok: true });
  }

  if (!body.id) return fail("Rekomendasi tidak ditemukan.");
  const rec = await db.procurementRecommendation.findUnique({ where: { id: body.id }, include: { items: { include: { medicine: true } } } });
  if (!rec) return fail("Rekomendasi tidak ditemukan.", 404);

  if (body.action === "approve") {
    await db.procurementRecommendation.update({ where: { id: rec.id }, data: { status: "DISETPUJUI", decidedAt: new Date() } });
    await logActivity(auth.user.name, "REKOMENDASI", `Rekomendasi ${rec.code} disetujui (${rupiah(rec.totalAmount)})`, rec.id);
    return ok({ ok: true });
  }
  if (body.action === "cancel") {
    await db.procurementRecommendation.update({ where: { id: rec.id }, data: { status: "DIBATALKAN", decidedAt: new Date() } });
    await logActivity(auth.user.name, "REKOMENDASI", `Rekomendasi ${rec.code} dibatalkan`, rec.id);
    return ok({ ok: true });
  }
  return fail("Aksi tidak dikenali.");
}
