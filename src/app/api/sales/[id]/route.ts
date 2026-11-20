import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, parseDate, logActivity } from "@/lib/api";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["Admin", "Petugas"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const body = await readJson<{ date?: string; medicineId?: string; quantity?: number; unitPrice?: number; mutation?: string; note?: string }>(req);
  const sale = await db.sale.findUnique({ where: { id } });
  if (!sale) return fail("Transaksi tidak ditemukan.", 404);
  if (!body) return fail("Data tidak valid.");

  const date = body.date ? parseDate(body.date) : sale.date;
  if (body.date && !date) return fail("Tanggal tidak valid.");
  const medicineId = body.medicineId ?? sale.medicineId;
  const med = await db.medicine.findUnique({ where: { id: medicineId } });
  if (!med) return fail("Obat tidak ditemukan.");
  const mutation = body.mutation === "R" ? "R" : body.mutation === "P" ? "P" : sale.mutation;
  let quantity = body.quantity !== undefined ? Math.round(body.quantity) : sale.quantity;
  if (quantity === 0) return fail("Jumlah tidak boleh nol.");
  if (mutation === "R" && quantity > 0) quantity = -quantity;
  if (mutation === "P" && quantity < 0) return fail("Gunakan mutasi R (retur) untuk kuantitas negatif.");
  const unitPrice = body.unitPrice !== undefined ? Math.round(body.unitPrice) : sale.unitPrice;
  if (unitPrice < 0) return fail("Harga tidak boleh negatif.");

  const updated = await db.sale.update({
    where: { id },
    data: { date: date!, medicineId, quantity, unitPrice, totalPrice: unitPrice * quantity, mutation, note: body.note?.trim() ?? sale.note },
  });
  await logActivity(auth.user.name, "DATA_PENJUALAN", `Transaksi penjualan diubah: ${med.name} (${quantity})`, id);
  return ok({ sale: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;
  const sale = await db.sale.findUnique({ where: { id }, include: { medicine: true } });
  if (!sale) return fail("Transaksi tidak ditemukan.", 404);
  await db.sale.delete({ where: { id } });
  await logActivity(auth.user.name, "DATA_PENJUALAN", `Transaksi penjualan dihapus: ${sale.medicine.name} (${sale.quantity})`, id);
  return ok({ ok: true });
}
