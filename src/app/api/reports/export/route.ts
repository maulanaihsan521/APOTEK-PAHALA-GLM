import { db } from "@/lib/db";
import { fail, requireUser, parseDate, logActivity } from "@/lib/api";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs";
import os from "os";

const execFileAsync = promisify(execFile);

/** Ekspor laporan: PDF (reportlab), Excel (openpyxl), CSV. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "pdf";
  // ambil data laporan yang sama dengan preview
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get("cookie") || "";
  const type = url.searchParams.get("type") || "penjualan";
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const res = await fetch(`${origin}/api/reports?type=${type}&from=${from ?? ""}&to=${to ?? ""}`, { headers: { cookie } });
  if (!res.ok) return fail("Gagal menyiapkan data laporan.", 500);
  const data = await res.json();

  const fname = `laporan-${type}-${new Date().toISOString().slice(0, 10)}`;

  if (format === "csv") {
    const rows = data.exportRows as { headers: string[]; rows: (string | number)[][] };
    const esc = (v: string | number) => {
      const s = String(v);
      return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [rows.headers, ...rows.rows].map((r) => r.map(esc).join(";")).join("\n");
    return new Response("\uFEFF" + csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${fname}.csv"` },
    });
  }

  if (format === "xlsx") {
    const rows = data.exportRows as { headers: string[]; rows: (string | number)[][] };
    const tmpJson = path.join(os.tmpdir(), `ap_report_${Date.now()}.json`);
    const tmpOut = path.join(os.tmpdir(), `${fname}.xlsx`);
    fs.writeFileSync(tmpJson, JSON.stringify({
      sheet: data.title?.slice(0, 28) || "Laporan", headers: rows.headers, rows: rows.rows,
    }));
    try {
      await execFileAsync("python3", [path.join(process.cwd(), "ml", "io_xlsx.py"), "write", "--json", tmpJson, "--out", tmpOut], { timeout: 120000 });
      const buf = fs.readFileSync(tmpOut);
      await logActivity(auth.user.name, "LAPORAN", `Laporan "${data.title}" diekspor ke Excel`);
      return new Response(new Uint8Array(buf), {
        headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${fname}.xlsx"` },
      });
    } catch (e) {
      return fail("Ekspor Excel gagal: " + (e as Error).message, 500);
    } finally {
      try { fs.unlinkSync(tmpJson); fs.unlinkSync(tmpOut); } catch {}
    }
  }

  // PDF
  const tmpJson = path.join(os.tmpdir(), `ap_report_${Date.now()}.json`);
  const tmpOut = path.join(os.tmpdir(), `${fname}.pdf`);
  fs.writeFileSync(tmpJson, JSON.stringify({
    title: data.title,
    subtitle: `Apotek Pahala - Pharmacy Intelligence`,
    periode: data.periode,
    createdAt: data.createdAt,
    summary: data.summary,
    chart: data.chart,
    table: data.table,
    insight: data.insight,
  }));
  try {
    await execFileAsync("python3", [path.join(process.cwd(), "scripts", "report_pdf.py"), "--json", tmpJson, "--out", tmpOut], { timeout: 120000 });
    const buf = fs.readFileSync(tmpOut);
    await logActivity(auth.user.name, "LAPORAN", `Laporan "${data.title}" diekspor ke PDF`);
    return new Response(new Uint8Array(buf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${fname}.pdf"` },
    });
  } catch (e) {
    return fail("Ekspor PDF gagal: " + (e as Error).message, 500);
  } finally {
    try { fs.unlinkSync(tmpJson); fs.unlinkSync(tmpOut); } catch {}
  }
}
