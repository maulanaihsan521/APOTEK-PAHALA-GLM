import { db } from "@/lib/db";
import { ok, requireUser } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const medicineId = url.searchParams.get("medicineId") || undefined;
  const take = Math.min(100, Number(url.searchParams.get("take") || 30));
  const movements = await db.inventoryMovement.findMany({
    where: medicineId ? { medicineId } : {},
    orderBy: { date: "desc" },
    take,
    include: { medicine: { select: { name: true, unit: true } } },
  });
  return ok({
    movements: movements.map((mv) => ({
      id: mv.id, date: mv.date, medicineName: mv.medicine.name, type: mv.type,
      beforeSystem: mv.beforeSystem, afterSystem: mv.afterSystem,
      userName: mv.userName, note: mv.note,
    })),
  });
}
