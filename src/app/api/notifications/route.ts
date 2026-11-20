import { db } from "@/lib/db";
import { ok, requireUser } from "@/lib/api";
import { computeStockStatus } from "@/lib/inventory-status";

export async function GET() {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;

  const [medicines, kritisSetting, logs] = await Promise.all([
    db.medicine.findMany({ where: { isActive: true }, include: { inventory: true } }),
    db.applicationSetting.findUnique({ where: { key: "inventory.kritisFactor" } }),
    db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const kritisFactor = Number(kritisSetting?.value ?? "0.8");

  const alerts: { id: string; level: "KRITIS" | "PERLU_PERHATIAN"; message: string }[] = [];
  for (const m of medicines) {
    const inv = m.inventory;
    const st = computeStockStatus(inv?.stockSystem ?? 0, m.minStock, kritisFactor);
    if (st.status === "KRITIS") alerts.push({ id: `stok-${m.id}`, level: "KRITIS", message: `Stok kritis: ${m.name} tersisa ${inv?.stockSystem ?? 0} ${m.unit.toLowerCase()} (minimum ${m.minStock}).` });
    else if (st.status === "PERLU_PERHATIAN") alerts.push({ id: `stok-${m.id}`, level: "PERLU_PERHATIAN", message: `Perlu perhatian: stok ${m.name} ${inv?.stockSystem ?? 0} ${m.unit.toLowerCase()} mendekati batas minimum.` });
  }

  return ok({
    notifications: [
      ...alerts,
      ...logs.slice(0, 5).map((l) => ({ id: l.id, level: "INFO" as const, message: `${l.message} (${l.userName})` })),
    ],
    alertCount: alerts.length,
  });
}
