/**
 * Autentikasi sederhana & aman tanpa dependensi tambahan:
 * - Password hashing scrypt (salt unik per pengguna)
 * - Token sesi HMAC-SHA256 (format: base64url(payload).signature)
 * - Cookie httpOnly "ap_session"
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies, headers } from "next/headers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { db } from "@/lib/db";

// Secret sesi disimpan sebagai berkas (bukan di source code)
function loadSecret(): string {
  const dir = path.join(process.cwd(), "storage");
  const file = path.join(dir, ".session_secret");
  try {
    if (existsSync(file)) return readFileSync(file, "utf8").trim();
    mkdirSync(dir, { recursive: true });
    const s = randomBytes(32).toString("hex");
    writeFileSync(file, s);
    return s;
  } catch {
    return randomBytes(32).toString("hex");
  }
}
const SECRET = process.env.SESSION_SECRET || loadSecret();
export const SESSION_COOKIE = "ap_session";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function b64url(input: string | Buffer): string {
  return Buffer.from(input).toString("base64url");
}

function sign(data: string): string {
  return createHmac("sha256", SECRET).update(data).digest("base64url");
}

export function createToken(userId: string, ttlHours = 24 * 7): string {
  const payload = b64url(JSON.stringify({ sub: userId, exp: Date.now() + ttlHours * 3600000 }));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined | null): { sub: string } | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!data.sub || typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return { sub: data.sub };
  } catch {
    return null;
  }
}

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: string;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  // Prioritas: token Bearer dari header Authorization (fallback untuk
  // lingkungan yang memblokir cookie), lalu cookie httpOnly.
  let token: string | undefined | null = null;
  try {
    const h = await headers();
    const auth = h.get("authorization");
    if (auth && auth.toLowerCase().startsWith("bearer ")) token = auth.slice(7).trim();
  } catch {
    /* headers() tidak tersedia di konteks ini — abaikan */
  }
  if (!token) {
    const store = await cookies();
    token = store.get(SESSION_COOKIE)?.value;
  }
  const parsed = verifyToken(token);
  if (!parsed) return null;
  const user = await db.user.findUnique({
    where: { id: parsed.sub },
    include: { role: true },
  });
  if (!user || !user.isActive) return null;
  return { id: user.id, username: user.username, name: user.name, role: user.role.name };
}
