import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";

/**
 * Penyesuaian stok sistem (penerimaan barang, pengurangan, koreksi).
 * Body: { medicineId, type: "PENERIMAAN"|"PENYESUAIAN"|"PENGURANGAN", delta?: number, newSystem?: number, note? }
 */
export async function POST(req: Request) {
  const auth = await requireUser(["Admin", "Petugas"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ medicineId?: string; type?: string; delta?: number; newSystem?: number; note?: string }>(req);
  if (!body?.medicineId) return fail("Pilih obat terlebih dahulu.");
  const med = await db.medicine.findUnique({ where: { id: body.medicineId }, include: { inventory: true } });
  if (!med || !med.inventory) return fail("Obat tidak ditemukan.", 404);

  const before = med.inventory.stockSystem;
  let after: number;
  let type = body.type || "PENYESUAIAN";
  if (body.newSystem !== undefined) {
    after = Math.round(body.newSystem);
    if (after < 0) return fail("Stok tidak boleh negatif.");
  } else if (body.delta !== undefined && body.delta !== 0) {
    after = before + Math.round(body.delta);
    if (after < 0) return fail(`Penyesuaian melebihi stok tersedia (stok saat ini ${before}).`);
  } else {
    return fail("Isi jumlah perubahan stok.");
  }
  if (type === "PENERIMAAN" && after < before) type = "PENYESUAIAN";
  if (after === before) return fail("Tidak ada perubahan stok yang dilakukan.");

  await db.$transaction([
    db.inventory.update({ where: { medicineId: med.id }, data: { stockSystem: after } }),
    db.inventoryMovement.create({
      data: {
        medicineId: med.id, date: new Date(), type,
        beforeSystem: before, afterSystem: after,
        userName: auth.user.name,
        note: body.note?.trim() || "Penyesuaian stok manual",
      },
    }),
  ]);
  await logActivity(auth.user.name, "STOK", `Stok ${med.name}: ${before} -> ${after} ${med.unit.toLowerCase()} (${type.toLowerCase()})`, med.id);
  return ok({ ok: true, before, after });
}
