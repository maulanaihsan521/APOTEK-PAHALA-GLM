import { NextResponse } from "next/server";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { db } from "@/lib/db";

export function ok(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, code?: string) {
  return NextResponse.json({ error: message, code: code ?? "ERROR" }, { status });
}

export async function requireUser(roles?: string[]): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser();
  if (!user) return { response: fail("Sesi berakhir. Silakan masuk kembali.", 401, "UNAUTHENTICATED") };
  if (roles && !roles.includes(user.role)) {
    return { response: fail("Anda tidak memiliki izin untuk aksi ini.", 403, "FORBIDDEN") };
  }
  return { user };
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}

export function parseDate(v: string | null, fallback?: Date): Date | undefined {
  if (!v) return fallback;
  const d = new Date(v.length === 10 ? `${v}T00:00:00.000Z` : v);
  return isNaN(d.getTime()) ? fallback : d;
}

export function nextMonday(after: Date): Date {
  const d = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate()));
  const dow = d.getUTCDay(); // 0=Minggu
  const add = dow === 0 ? 1 : 8 - dow;
  d.setUTCDate(d.getUTCDate() + add);
  return d;
}

export function rupiah(n: number): string {
  return "Rp " + Math.round(n).toLocaleString("id-ID");
}

export function formatCompactJt(n: number): string {
  if (n >= 1e9) return `Rp ${(n / 1e9).toFixed(1).replace(".", ",")} M`;
  if (n >= 1e6) return `Rp ${(n / 1e6).toFixed(1).replace(".", ",")} jt`;
  if (n >= 1e3) return `Rp ${(n / 1e3).toFixed(1).replace(".", ",")} rb`;
  return `Rp ${Math.round(n)}`;
}

export async function logActivity(userName: string, type: string, message: string, objectRef?: string) {
  await db.activityLog.create({ data: { userName, type, message, objectRef } });
}
