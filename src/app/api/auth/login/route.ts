import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SESSION_COOKIE, createToken, verifyPassword } from "@/lib/auth";
import { fail, readJson, logActivity } from "@/lib/api";

export async function POST(req: Request) {
  const body = await readJson<{ username?: string; password?: string }>(req);
  if (!body?.username || !body?.password) return fail("Nama pengguna dan kata sandi wajib diisi.");
  const user = await db.user.findUnique({ where: { username: body.username.trim().toLowerCase() }, include: { role: true } });
  if (!user || !user.isActive || !verifyPassword(body.password, user.passwordHash)) {
    return fail("Nama pengguna atau kata sandi salah.", 401, "INVALID_LOGIN");
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await logActivity(user.name, "SISTEM", `${user.name} masuk ke aplikasi`);
  const token = createToken(user.id);
  // Token juga dikirim di body sebagai fallback (Bearer) untuk lingkungan
  // yang memblokir cookie pihak ketiga (mis. preview dalam iframe).
  const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, name: user.name, role: user.role.name }, token });
  // HTTPS (preview/proxy): SameSite=None + Secure agar sesi tetap hidup saat
  // aplikasi dibuka dalam iframe lintas-site. HTTP lokal: Lax (localhost aman).
  const proto = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "")).split(",")[0].trim();
  const isHttps = proto === "https";
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: isHttps ? "none" : "lax", secure: isHttps, path: "/", maxAge: 7 * 24 * 3600,
  });
  return res;
}
