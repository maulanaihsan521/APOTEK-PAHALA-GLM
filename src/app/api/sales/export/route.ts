/**
 * Ekspor data penjualan: CSV langsung, Excel (.xlsx) via openpyxl.
 */
import { db } from "@/lib/db";
import { fail, requireUser, parseDate } from "@/lib/api";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "csv";
  const from = parseDate(url.searchParams.get("from"));
  const toExcl = parseDate(url.searchParams.get("to"), undefined);
  const to = toExcl ? new Date(toExcl.getTime() + 86399999) : undefined;
  const medicineId = url.searchParams.get("medicineId") || undefined;

  const rows = await db.sale.findMany({
    where: {
      AND: [from ? { date: { gte: from } } : {}, to ? { date: { lte: to } } : {}, medicineId ? { medicineId } : {}],
    },
    orderBy: [{ date: "asc" }],
    include: { medicine: { select: { name: true, code: true } } },
    take: 20000,
  });

  const headers = ["ID Transaksi", "Tanggal", "Kode Obat", "Nama Obat", "Jumlah", "Harga Satuan (Rp)", "Total Harga (Rp)", "Mutasi"];
  const data = rows.map((r) => [
    r.id, r.date.toISOString().slice(0, 10), r.medicine.code, r.medicine.name,
    r.quantity, r.unitPrice, r.totalPrice, r.mutation,
  ]);

  if (format === "xlsx") {
    const tmpJson = path.join(os.tmpdir(), `ap_sales_${Date.now()}.json`);
    const tmpOut = path.join(os.tmpdir(), `ap_sales_${Date.now()}.xlsx`);
    fs.writeFileSync(tmpJson, JSON.stringify({ sheet: "Data Penjualan", headers, rows: data }));
    try {
      await execFileAsync("python3", [path.join(process.cwd(), "ml", "io_xlsx.py"), "write", "--json", tmpJson, "--out", tmpOut], { timeout: 120000 });
      const buf = fs.readFileSync(tmpOut);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="data-penjualan-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    } catch (e) {
      return fail("Ekspor Excel gagal: " + (e as Error).message, 500);
    } finally {
      try { fs.unlinkSync(tmpJson); fs.unlinkSync(tmpOut); } catch {}
    }
  }

  // CSV
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...data].map((r) => r.map(esc).join(";")).join("\n");
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="data-penjualan-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
