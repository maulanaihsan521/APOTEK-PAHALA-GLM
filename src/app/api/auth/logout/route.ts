import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const res = NextResponse.json({ ok: true });
  // Atribut cookie saat menghapus harus sama dengan saat membuat agar
  // browser mengganti (bukan menambah) entri cookie lama.
  const proto = (req.headers.get("x-forwarded-proto") || new URL(req.url).protocol.replace(":", "")).split(",")[0].trim();
  const isHttps = proto === "https";
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true, sameSite: isHttps ? "none" : "lax", secure: isHttps, path: "/", maxAge: 0,
  });
  return res;
}
