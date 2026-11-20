import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson<{ name?: string; category?: string; unit?: string; basePrice?: number; minStock?: number }>(req);
  if (!body) return fail("Data tidak valid.");
  const med = await db.medicine.findUnique({ where: { id } });
  if (!med) return fail("Obat tidak ditemukan.", 404);
  if (body.basePrice !== undefined && body.basePrice < 0) return fail("Harga tidak boleh negatif.");
  if (body.minStock !== undefined && body.minStock < 0) return fail("Stok minimum tidak boleh negatif.");
  const updated = await db.medicine.update({
    where: { id },
    data: {
      name: body.name?.trim() ?? med.name,
      category: body.category?.trim() ?? med.category,
      unit: body.unit?.trim() ?? med.unit,
      basePrice: body.basePrice !== undefined ? Math.round(body.basePrice) : med.basePrice,
      minStock: body.minStock !== undefined ? Math.round(body.minStock) : med.minStock,
    },
  });
  await logActivity(auth.user.name, "STOK", `Data obat diperbarui: ${updated.name}`, id);
  return ok({ medicine: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const med = await db.medicine.findUnique({ where: { id } });
  if (!med) return fail("Obat tidak ditemukan.", 404);
  // nonaktifkan (soft delete) agar histori penjualan tetap utuh
  await db.medicine.update({ where: { id }, data: { isActive: false } });
  await logActivity(auth.user.name, "STOK", `Obat dinonaktifkan: ${med.name} (${med.code})`, id);
  return ok({ ok: true });
}
