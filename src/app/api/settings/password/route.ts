import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth";

/** Ganti kata sandi akun yang sedang masuk. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if ("response" in auth) return auth.response;
  const body = await readJson<{ current?: string; newPassword?: string }>(req);
  if (!body?.current || !body?.newPassword) return fail("Lengkapi kata sandi saat ini dan kata sandi baru.");
  if (body.newPassword.length < 6) return fail("Kata sandi baru minimal 6 karakter.");
  const user = await db.user.findUnique({ where: { id: auth.user.id } });
  if (!user || !verifyPassword(body.current, user.passwordHash)) return fail("Kata sandi saat ini salah.", 401);
  await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(body.newPassword) } });
  return ok({ ok: true });
}
