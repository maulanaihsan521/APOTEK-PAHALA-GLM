import { db } from "@/lib/db";
import { ok, fail, requireUser, parseDate } from "@/lib/api";

export async function GET(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const url = new URL(req.url);
  const from = parseDate(url.searchParams.get("from"), new Date(Date.now() - 30 * 86400000))!;
  const toExcl = parseDate(url.searchParams.get("to"), new Date())!;
  const to = new Date(toExcl.getTime() + 86399999);
  const page = Math.max(1, Number(url.searchParams.get("page") || 1));
  const pageSize = Math.min(100, Math.max(5, Number(url.searchParams.get("pageSize") || 10)));
  const search = url.searchParams.get("search")?.trim();

  const where = { date: { gte: from, lte: to }, ...(search ? {} : {}) };
  const [rows, total, agg, meta] = await Promise.all([
    db.weatherData.findMany({ where, orderBy: { date: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.weatherData.count({ where }),
    db.weatherData.aggregate({ where, _avg: { temperature: true, humidity: true }, _sum: { rainfall: true } }),
    db.weatherData.aggregate({ _max: { date: true }, _count: true }),
  ]);

  // tren mingguan (maks 12 pekan terakhir dalam rentang)
  const allInRange = await db.weatherData.findMany({ where, orderBy: { date: "asc" } });
  const byWeek = new Map<string, { temp: number[]; rain: number; rh: number[] }>();
  for (const w of allInRange) {
    const d = new Date(w.date);
    const dow = (d.getUTCDay() + 6) % 7;
    const ws = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow));
    const key = ws.toISOString().slice(0, 10);
    const cur = byWeek.get(key) || { temp: [], rain: 0, rh: [] };
    cur.temp.push(w.temperature); cur.rh.push(w.humidity); cur.rain += w.rainfall;
    byWeek.set(key, cur);
  }
  const weekly = [...byWeek.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12)
    .map(([ws, v]) => ({
      weekStart: ws,
      temp: Math.round((v.temp.reduce((s, x) => s + x, 0) / (v.temp.length || 1)) * 10) / 10,
      rain: Math.round(v.rain * 10) / 10,
      rh: Math.round(v.rh.reduce((s, x) => s + x, 0) / (v.rh.length || 1)),
    }));

  return ok({
    rows: rows.map((r) => ({ id: r.id, date: r.date, temperature: r.temperature, rainfall: r.rainfall, humidity: r.humidity, source: r.source })),
    total, page, pageSize,
    kpi: {
      temp: agg._avg.temperature !== null ? Math.round(agg._avg.temperature * 10) / 10 : null,
      rain: agg._sum.rainfall !== null ? Math.round(agg._sum.rainfall * 10) / 10 : null,
      humidity: agg._avg.humidity !== null ? Math.round(agg._avg.humidity) : null,
    },
    weekly,
    meta: {
      source: "NASA POWER MERRA-2 (reanalisis, koordinat Banjarnegara)",
      dataFrom: allInRange.length ? allInRange[0].date.toISOString().slice(0, 10) : null,
      lastDate: meta._max.date ? meta._max.date.toISOString().slice(0, 10) : null,
      totalRecords: meta._count,
    },
  });
}
