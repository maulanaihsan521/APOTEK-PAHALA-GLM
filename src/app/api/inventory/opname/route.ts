import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";

/**
 * Stock opname: simpan hasil penghitungan fisik.
 * Body: { medicineId, stockPhysical, note? }  atau  { items: [{medicineId, stockPhysical}] }
 */
export async function POST(req: Request) {
  const auth = await requireUser(["Admin", "Petugas"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ medicineId?: string; stockPhysical?: number; note?: string; items?: { medicineId: string; stockPhysical: number }[] }>(req);

  const results: { name: string; before: number; physical: number; selisih: number }[] = [];
  const items = body?.items && body.items.length ? body.items : body?.medicineId ? [{ medicineId: body.medicineId, stockPhysical: body.stockPhysical! }] : [];
  if (!items.length) return fail("Tidak ada data stock opname yang dikirim.");

  for (const it of items) {
    if (it.stockPhysical === undefined || it.stockPhysical === null || Number.isNaN(it.stockPhysical))
      return fail("Isi stok fisik hasil penghitungan terlebih dahulu.");
    if (it.stockPhysical < 0) return fail("Stok fisik tidak boleh negatif.");
    const med = await db.medicine.findUnique({ where: { id: it.medicineId }, include: { inventory: true } });
    if (!med || !med.inventory) return fail("Obat tidak ditemukan.", 404);
    const before = med.inventory.stockSystem;
    const physical = Math.round(it.stockPhysical);
    await db.$transaction([
      db.inventory.update({ where: { medicineId: med.id }, data: { stockPhysical: physical, lastOpnameAt: new Date() } }),
      db.inventoryMovement.create({
        data: {
          medicineId: med.id, date: new Date(), type: "OPNAME",
          beforeSystem: before, afterSystem: before,
          userName: auth.user.name,
          note: body?.note?.trim() || `Stock opname: fisik ${physical} (sistem ${before})`,
        },
      }),
    ]);
    results.push({ name: med.name, before, physical, selisih: physical - before });
  }

  const nSelisih = results.filter((r) => r.selisih !== 0).length;
  await logActivity(auth.user.name, "STOK", `Stock opname disimpan (${results.length} obat, ${nSelisih} selisih)`);
  return ok({ ok: true, results });
}
