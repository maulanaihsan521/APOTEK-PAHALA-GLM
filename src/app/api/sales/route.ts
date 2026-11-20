import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, parseDate, logActivity } from "@/lib/api";
import type { Prisma } from "@prisma/client";

const SORTS = ["date", "medicine", "quantity", "unitPrice", "totalPrice"] as const;

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim() || "";
  const from = parseDate(url.searchParams.get("from"));
  const to = parseDate(url.searchParams.get("to"), undefined);
  const toExcl = to ? new Date(to.getTime() + 86399999) : undefined;
  const medicineId = url.searchParams.get("medicineId") || undefined;
  const mutation = url.searchParams.get("mutation") || undefined;
  const sortKey = (url.searchParams.get("sort") || "date") as (typeof SORTS)[number];
  const sortDir: Prisma.SortOrder = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 10)));

  const where = {
    AND: [
      from ? { date: { gte: from } } : {},
      toExcl ? { date: { lte: toExcl } } : {},
      medicineId ? { medicineId } : {},
      mutation ? { mutation } : {},
      search ? { medicine: { OR: [{ name: { contains: search } }, { code: { contains: search } }] } } : {},
    ],
  };

  const orderBy =
    sortKey === "medicine" ? { medicine: { name: sortDir } } :
    sortKey === "quantity" ? { quantity: sortDir } :
    sortKey === "unitPrice" ? { unitPrice: sortDir } :
    sortKey === "totalPrice" ? { totalPrice: sortDir } :
    [{ date: sortDir }, { createdAt: sortDir }];

  const [total, rows, agg] = await Promise.all([
    db.sale.count({ where }),
    db.sale.findMany({
      where, orderBy,
      include: { medicine: { select: { name: true, code: true, unit: true } } },
      skip: (page - 1) * pageSize, take: pageSize,
    }),
    db.sale.aggregate({ where, _sum: { quantity: true, totalPrice: true }, _count: true }),
  ]);

  return ok({
    rows: rows.map((r) => ({
      id: r.id, date: r.date, mutation: r.mutation,
      medicineId: r.medicineId, medicineName: r.medicine.name, medicineCode: r.medicine.code, unit: r.medicine.unit,
      quantity: r.quantity, unitPrice: r.unitPrice, totalPrice: r.totalPrice, source: r.source,
    })),
    total,
    page, pageSize,
    summary: { units: agg._sum.quantity ?? 0, revenue: agg._sum.totalPrice ?? 0 },
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(["Admin", "Petugas"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{
    date?: string; medicineId?: string; quantity?: number; unitPrice?: number; mutation?: string; note?: string;
  }>(req);
  if (!body?.date || !body?.medicineId || body.quantity === undefined || body.unitPrice === undefined) {
    return fail("Lengkapi tanggal, obat, jumlah, dan harga satuan.");
  }
  const date = parseDate(body.date);
  if (!date) return fail("Tanggal tidak valid.");
  const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
  if (date.getTime() > endOfToday.getTime()) return fail("Tanggal transaksi tidak boleh di masa depan.");
  if (body.quantity === 0) return fail("Jumlah tidak boleh nol.");
  if (body.unitPrice < 0) return fail("Harga tidak boleh negatif.");
  const mutation = body.mutation === "R" ? "R" : "P";
  let quantity = Math.round(body.quantity);
  if (mutation === "R" && quantity > 0) quantity = -quantity;
  if (mutation === "P" && quantity < 0) return fail("Gunakan mutasi R (retur) untuk kuantitas negatif.");
  const med = await db.medicine.findUnique({ where: { id: body.medicineId } });
  if (!med) return fail("Obat tidak ditemukan. Pilih obat dari daftar.");
  const sale = await db.sale.create({
    data: {
      date, medicineId: med.id, quantity, unitPrice: Math.round(body.unitPrice),
      totalPrice: Math.round(body.unitPrice) * quantity, mutation,
      note: body.note?.trim() || null, source: "MANUAL", createdBy: auth.user.name,
    },
  });
  await logActivity(auth.user.name, "DATA_PENJUALAN", `Transaksi penjualan ditambahkan: ${med.name} (${quantity} ${med.unit.toLowerCase()})`, sale.id);
  return ok({ sale }, { status: 201 });
}
