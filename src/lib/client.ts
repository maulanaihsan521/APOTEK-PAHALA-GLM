"use client";

/**
 * Fallback sesi: jika browser memblokir cookie (mis. preview dalam iframe
 * lintas-site), token dipakai via header Authorization: Bearer.
 */
const TOKEN_KEY = "ap.token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

export function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* penyimpanan tidak tersedia */
  }
}

/** Helper panggil API + format angka Indonesia. */
export async function api<T = unknown>(path: string, opts?: RequestInit & { json?: unknown }): Promise<T> {
  const init: RequestInit = { ...opts };
  const headers: Record<string, string> = { ...((opts?.headers as Record<string, string>) || {}) };
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (opts?.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    headers["Content-Type"] = "application/json";
  }
  init.headers = headers;
  const res = await fetch(path, { credentials: "same-origin", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && (data as { code?: string }).code === "UNAUTHENTICATED") {
      clearStoredToken();
      window.dispatchEvent(new CustomEvent("ap:unauthorized"));
    }
    const err = new Error((data as { error?: string }).error || `Kesalahan server (${res.status})`);
    (err as Error & { code?: string }).code = (data as { code?: string }).code;
    throw err;
  }
  return data as T;
}

export const rp = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : "Rp " + Math.round(n).toLocaleString("id-ID");

export const num = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined ? "-" : n.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const pct = (n: number | null | undefined) =>
  n === null || n === undefined ? "-" : `${num(n, 1)}%`;

export function fmtDate(d: string | Date | null | undefined, style: "short" | "long" | "datetime" = "short"): string {
  if (!d) return "-";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "-";
  if (style === "long")
    return date.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" });
  if (style === "datetime")
    return date.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Jakarta" });
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
}

export const tanggalRangeLabel = (from: string, to: string) =>
  `${fmtDate(from)} – ${fmtDate(to)}`;

export function deltaColor(v: number | null): string {
  if (v === null) return "text-muted-foreground";
  return v >= 0 ? "text-success" : "text-danger";
}
