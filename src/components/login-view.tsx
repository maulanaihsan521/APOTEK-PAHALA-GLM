"use client";

import { useState } from "react";
import { api, setStoredToken } from "@/lib/client";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User, Eye, EyeOff, Info } from "lucide-react";

export interface UserInfo {
  id: string;
  username: string;
  name: string;
  role: string;
}

export function LoginView({ onSuccess }: { onSuccess: (u: UserInfo) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fillDemo(u: string, p: string) {
    setUsername(u);
    setPassword(p);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const uname = username.trim();
    if (!uname || !password) {
      setError("Nama pengguna dan kata sandi wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const res = await api<{ user: UserInfo; token?: string }>("/api/auth/login", { method: "POST", json: { username: uname.toLowerCase(), password } });
      if (res.token) setStoredToken(res.token);
      onSuccess(res.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-[#0B5F52] via-[#087F6B] to-[#20B58A] relative overflow-hidden">
      <div className="absolute -left-24 -bottom-24 w-96 h-96 rounded-full bg-white/5" aria-hidden />
      <div className="absolute right-0 top-0 w-80 h-80 rounded-full bg-white/5 translate-x-1/3 -translate-y-1/3" aria-hidden />
      <div className="w-full max-w-md relative">
        <div className="bg-card rounded-2xl shadow-2xl p-8 border">
          <div className="flex flex-col items-center text-center gap-2 mb-6">
            <Logo size={56} />
            <h1 className="text-xl font-bold text-foreground mt-2">Apotek Pahala</h1>
            <p className="text-sm text-muted-foreground">Pharmacy Intelligence — Solusi Analitik untuk Persediaan Obat yang Lebih Tepat</p>
          </div>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username">Nama Pengguna</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input id="username" className="pl-9" placeholder="masukkan nama pengguna" value={username} autoComplete="username"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="text"
                  onChange={(e) => setUsername(e.target.value.replace(/\s+/g, ""))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Kata Sandi</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input id="password" type={show ? "text" : "password"} className="pl-9 pr-10" placeholder="masukkan kata sandi"
                  value={password} autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)} />
                <button type="button" aria-label={show ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShow((s) => !s)}>
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            {error && (
              <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" className="w-full h-11 text-[15px] font-semibold" disabled={loading}>
              {loading ? <><Loader2 className="size-4 animate-spin" /> Memproses…</> : "Masuk"}
            </Button>
          </form>
          <div className="mt-6 text-xs text-muted-foreground bg-muted/60 border rounded-lg p-3">
            <p className="font-medium text-foreground mb-2 flex items-center gap-1.5">
              <Info className="size-3.5 text-info" /> Masuk cepat akun demo (DEMO) — ketuk salah satu:
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button"
                className="text-left rounded-lg border bg-card px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => fillDemo("admin", "admin123")}>
                <span className="block font-semibold text-foreground">Admin</span>
                <code className="text-[11px] text-muted-foreground">admin / admin123</code>
              </button>
              <button type="button"
                className="text-left rounded-lg border bg-card px-3 py-2 hover:border-primary hover:bg-primary/5 transition-colors"
                onClick={() => fillDemo("petugas", "petugas123")}>
                <span className="block font-semibold text-foreground">Petugas</span>
                <code className="text-[11px] text-muted-foreground">petugas / petugas123</code>
              </button>
            </div>
            <p className="mt-2 text-[11px]">Setelah terisi otomatis, tekan tombol <b>Masuk</b>.</p>
          </div>
        </div>
        <p className="text-center text-xs text-emerald-50/80 mt-4">
          Capstone Design Project — S1 Sistem Informasi, Universitas Telkom Purwokerto · 2026
        </p>
      </div>
    </div>
  );
}
