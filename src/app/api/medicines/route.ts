import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";
import { computeStockStatus } from "@/lib/inventory-status";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const meds = await db.medicine.findMany({
    where: { isActive: true },
    include: { inventory: true },
    orderBy: { name: "asc" },
  });
  const kritisSetting = await db.applicationSetting.findUnique({ where: { key: "inventory.kritisFactor" } });
  const kritisFactor = Number(kritisSetting?.value ?? "0.8");
  return ok({
    medicines: meds.map((m) => {
      const st = computeStockStatus(m.inventory?.stockSystem ?? 0, m.minStock, kritisFactor);
      return {
        id: m.id, code: m.code, name: m.name, category: m.category, unit: m.unit,
        basePrice: m.basePrice, minStock: m.minStock, buyUnit: m.buyUnit,
        stockSystem: m.inventory?.stockSystem ?? 0,
        stockPhysical: m.inventory?.stockPhysical ?? 0,
        selisih: (m.inventory?.stockPhysical ?? 0) - (m.inventory?.stockSystem ?? 0),
        lastOpnameAt: m.inventory?.lastOpnameAt ?? null,
        status: st.status, statusLabel: st.label,
      };
    }),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{
    code?: string; name?: string; category?: string; unit?: string;
    basePrice?: number; minStock?: number; stockSystem?: number; stockPhysical?: number;
  }>(req);
  if (!body?.code?.trim() || !body?.name?.trim()) return fail("Kode dan nama obat wajib diisi.");
  if (!body.basePrice || body.basePrice < 0) return fail("Harga tidak boleh negatif.");
  if (body.minStock === undefined || body.minStock < 0) return fail("Stok minimum tidak boleh negatif.");
  const exists = await db.medicine.findUnique({ where: { code: body.code.trim() } });
  if (exists) return fail(`Kode obat "${body.code}" sudah terdaftar.`);
  const med = await db.medicine.create({
    data: {
      code: body.code.trim(), name: body.name.trim(),
      category: body.category?.trim() || "Umum", unit: body.unit?.trim() || "Strip",
      basePrice: Math.round(body.basePrice), minStock: Math.round(body.minStock),
    },
  });
  await db.inventory.create({
    data: {
      medicineId: med.id,
      stockSystem: Math.max(0, Math.round(body.stockSystem ?? 0)),
      stockPhysical: Math.max(0, Math.round(body.stockPhysical ?? body.stockSystem ?? 0)),
      lastOpnameAt: new Date(),
    },
  });
  await logActivity(auth.user.name, "STOK", `Obat baru ditambahkan: ${med.name} (${med.code})`, med.id);
  return ok({ medicine: med }, { status: 201 });
}
