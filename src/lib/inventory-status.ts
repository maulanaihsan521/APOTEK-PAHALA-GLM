/**
 * Logika status persediaan (dapat dikonfigurasi melalui Pengaturan):
 * - Aman            : stok sistem >= stok minimum
 * - Perlu Perhatian : stok di bawah minimum tetapi masih >= kritisFactor x minimum
 * - Kritis          : stok < kritisFactor x minimum (atau habis)
 * kritisFactor disimpan di pengaturan (inventory.kritisFactor, bawaan 0.8).
 */
export interface StockStatusResult {
  status: "AMAN" | "PERLU_PERHATIAN" | "KRITIS";
  label: string;
}

export function computeStockStatus(stockSystem: number, minStock: number, kritisFactor: number): StockStatusResult {
  if (stockSystem <= 0 || stockSystem < minStock * kritisFactor) {
    return { status: "KRITIS", label: "Kritis" };
  }
  if (stockSystem < minStock) {
    return { status: "PERLU_PERHATIAN", label: "Perlu Perhatian" };
  }
  return { status: "AMAN", label: "Aman" };
}

/**
 * Tingkat urgensi pengadaan berdasar cakupan stok terhadap permintaan mingguan.
 */
export function computeUrgency(currentStock: number, forecastDemand: number, periodWeeks: number): "KRITIS" | "TINGGI" | "SEDANG" | "RENDAH" {
  const weekly = forecastDemand / Math.max(1, periodWeeks);
  if (weekly <= 0) return "RENDAH";
  const covered = currentStock / weekly;
  if (currentStock <= 0 || covered < 0.5) return "KRITIS";
  if (covered < 1) return "TINGGI";
  if (covered < 2) return "SEDANG";
  return "RENDAH";
}
