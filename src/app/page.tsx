"use client";

import { useCallback, useEffect, useState } from "react";
import { ThemeProvider } from "next-themes";
import { api } from "@/lib/client";
import { LoginView, type UserInfo } from "@/components/login-view";
import { AppShell, type Period, type ViewKey } from "@/components/app-shell";
import { DashboardView } from "@/components/views/dashboard";
import { PrediksiView } from "@/components/views/prediksi";
import { PenjualanView } from "@/components/views/penjualan";
import { CuacaView } from "@/components/views/cuaca";
import { StokView } from "@/components/views/stok";
import { PengadaanView } from "@/components/views/pengadaan";
import { LaporanView } from "@/components/views/laporan";
import { PengaturanView } from "@/components/views/pengaturan";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_PERIOD: Period = { from: "2025-01-01", to: "2025-01-31" };

export default function Page() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [view, setView] = useState<ViewKey>("dashboard");
  const [period, setPeriod] = useState<Period>(DEFAULT_PERIOD);

  useEffect(() => {
    // Muat skala font tersimpan
    const fs = localStorage.getItem("ap.fontScale");
    if (fs) document.documentElement.style.fontSize = fs;
    api<{ user: UserInfo }>("/api/auth/me")
      .then((res) => setUser(res.user))
      .catch(() => setUser(null))
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    // Sesi berakhir (401 dari API mana pun) -> kembali ke halaman masuk
    const onUnauthorized = () => {
      setUser((cur) => {
        if (cur) toast.info("Sesi berakhir. Silakan masuk kembali.");
        return null;
      });
    };
    window.addEventListener("ap:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ap:unauthorized", onUnauthorized);
  }, []);

  const onSuccess = useCallback((u: UserInfo) => {
    setUser(u);
    setView("dashboard");
  }, []);

  if (booting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm">Memuat Apotek Pahala…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <LoginView onSuccess={onSuccess} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <AppShell
        user={user}
        view={view}
        onViewChange={setView}
        period={period}
        onPeriodChange={setPeriod}
        onLogout={() => setUser(null)}
      >
        {view === "dashboard" && <DashboardView period={period} />}
        {view === "prediksi" && <PrediksiView />}
        {view === "penjualan" && <PenjualanView user={user} />}
        {view === "cuaca" && <CuacaView />}
        {view === "stok" && <StokView user={user} />}
        {view === "pengadaan" && <PengadaanView user={user} />}
        {view === "laporan" && <LaporanView period={period} />}
        {view === "pengaturan" && <PengaturanView user={user} />}
      </AppShell>
    </ThemeProvider>
  );
}
