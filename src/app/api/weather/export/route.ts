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

  const rows = await db.weatherData.findMany({
    where: { AND: [from ? { date: { gte: from } } : {}, to ? { date: { lte: to } } : {}] },
    orderBy: { date: "asc" },
    take: 20000,
  });

  const headers = ["Tanggal", "Suhu (C)", "Curah Hujan (mm)", "Kelembapan (%)", "Sumber"];
  const data = rows.map((r) => [r.date.toISOString().slice(0, 10), r.temperature, r.rainfall, r.humidity, r.source]);

  if (format === "xlsx") {
    const tmpJson = path.join(os.tmpdir(), `ap_weather_${Date.now()}.json`);
    const tmpOut = path.join(os.tmpdir(), `ap_weather_${Date.now()}.xlsx`);
    fs.writeFileSync(tmpJson, JSON.stringify({ sheet: "Data Cuaca", headers, rows: data }));
    try {
      await execFileAsync("python3", [path.join(process.cwd(), "ml", "io_xlsx.py"), "write", "--json", tmpJson, "--out", tmpOut], { timeout: 120000 });
      const buf = fs.readFileSync(tmpOut);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="data-cuaca-${new Date().toISOString().slice(0, 10)}.xlsx"`,
        },
      });
    } catch (e) {
      return fail("Ekspor Excel gagal: " + (e as Error).message, 500);
    } finally {
      try { fs.unlinkSync(tmpJson); fs.unlinkSync(tmpOut); } catch {}
    }
  }

  const esc = (v: string | number) => {
    const s = String(v);
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers, ...data].map((r) => r.map(esc).join(";")).join("\n");
  return new Response("\uFEFF" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="data-cuaca-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
