import { db } from "@/lib/db";
import { ok, fail, requireUser, readJson, logActivity } from "@/lib/api";
import { hashPassword } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const users = await db.user.findMany({ include: { role: true }, orderBy: { username: "asc" } });
  return ok({
    users: users.map((u) => ({
      id: u.id, username: u.username, name: u.name, role: u.role.name,
      isActive: u.isActive, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ username?: string; name?: string; password?: string; role?: string }>(req);
  if (!body?.username?.trim() || !body?.name?.trim() || !body?.password) return fail("Lengkapi nama pengguna, nama lengkap, dan kata sandi.");
  if (body.password.length < 6) return fail("Kata sandi minimal 6 karakter.");
  const uname = body.username.trim().toLowerCase();
  const exists = await db.user.findUnique({ where: { username: uname } });
  if (exists) return fail("Nama pengguna sudah digunakan.");
  const roleName = body.role === "Petugas" ? "Petugas" : "Admin";
  const role = await db.role.findUnique({ where: { name: roleName } });
  if (!role) return fail("Peran tidak ditemukan.", 500);
  const user = await db.user.create({
    data: { username: uname, name: body.name.trim(), passwordHash: hashPassword(body.password), roleId: role.id },
  });
  await logActivity(auth.user.name, "SISTEM", `Akun baru dibuat: ${user.username} (${roleName})`);
  return ok({ ok: true, id: user.id });
}

export async function PATCH(req: Request) {
  const auth = await requireUser(["Admin"]);
  if ("response" in auth) return auth.response;
  const body = await readJson<{ id?: string; name?: string; password?: string; isActive?: boolean }>(req);
  if (!body?.id) return fail("Pengguna tidak ditemukan.");
  const user = await db.user.findUnique({ where: { id: body.id } });
  if (!user) return fail("Pengguna tidak ditemukan.", 404);
  if (body.password && body.password.length < 6) return fail("Kata sandi minimal 6 karakter.");
  const data: Record<string, unknown> = {};
  if (body.name?.trim()) data.name = body.name.trim();
  if (body.password) data.passwordHash = hashPassword(body.password);
  if (body.isActive !== undefined && user.id !== auth.user.id) data.isActive = body.isActive;
  await db.user.update({ where: { id: user.id }, data });
  await logActivity(auth.user.name, "SISTEM", `Akun diperbarui: ${user.username}`);
  return ok({ ok: true });
}
