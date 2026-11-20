import { db } from "@/lib/db";
import { ok, requireUser } from "@/lib/api";
import { computeStockStatus } from "@/lib/inventory-status";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const search = url.searchParams.get("search")?.trim().toLowerCase() || "";
  const statusFilter = url.searchParams.get("status") || ""; // AMAN|PERLU_PERHATIAN|KRITIS

  const meds = await db.medicine.findMany({
    where: { isActive: true },
    include: { inventory: true },
    orderBy: { name: "asc" },
  });
  const kritisSetting = await db.applicationSetting.findUnique({ where: { key: "inventory.kritisFactor" } });
  const kritisFactor = Number(kritisSetting?.value ?? "0.8");

  const items = meds.map((m) => {
    const inv = m.inventory;
    const st = computeStockStatus(inv?.stockSystem ?? 0, m.minStock, kritisFactor);
    return {
      id: m.id, code: m.code, name: m.name, category: m.category, unit: m.unit,
      stockSystem: inv?.stockSystem ?? 0,
      stockPhysical: inv?.stockPhysical ?? 0,
      selisih: (inv?.stockPhysical ?? 0) - (inv?.stockSystem ?? 0),
      minStock: m.minStock,
      status: st.status, statusLabel: st.label,
      lastOpnameAt: inv?.lastOpnameAt ?? null,
      updatedAt: inv?.updatedAt ?? null,
    };
  });

  const filtered = items.filter((it) => {
    if (search && !`${it.name} ${it.code} ${it.category}`.toLowerCase().includes(search)) return false;
    if (statusFilter && it.status !== statusFilter) return false;
    return true;
  });

  return ok({
    items: filtered,
    summary: {
      totalItems: items.length,
      totalStock: items.reduce((s, it) => s + it.stockSystem, 0),
      totalSelisih: items.reduce((s, it) => s + it.selisih, 0),
      perluPerhatian: items.filter((it) => it.status === "PERLU_PERHATIAN").length,
      kritis: items.filter((it) => it.status === "KRITIS").length,
    },
  });
}
