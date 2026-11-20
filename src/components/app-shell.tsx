"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { api, clearStoredToken, fmtDate } from "@/lib/client";
import { Logo, LogoTitle } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import type { UserInfo } from "@/components/login-view";
import {
  Home, TrendingUp, ShoppingCart, CloudSun, Package, ClipboardList, FileText, Settings,
  Bell, CalendarDays, LogOut, Sun, Moon, Menu, ChevronDown, Loader2, KeyRound, AlertTriangle, Info, AlertCircle,
} from "lucide-react";

export type ViewKey = "dashboard" | "prediksi" | "penjualan" | "cuaca" | "stok" | "pengadaan" | "laporan" | "pengaturan";

export const NAV_ITEMS: { key: ViewKey; label: string; icon: typeof Home; title: string; subtitle: string }[] = [
  { key: "dashboard", label: "Ringkasan", icon: Home, title: "Ringkasan Apotek", subtitle: "Pantau penjualan, persediaan, dan prediksi permintaan." },
  { key: "prediksi", label: "Prediksi Permintaan", icon: TrendingUp, title: "Prediksi Permintaan", subtitle: "Estimasi permintaan obat menggunakan Random Forest Regression." },
  { key: "penjualan", label: "Data Penjualan", icon: ShoppingCart, title: "Data Penjualan", subtitle: "Kelola transaksi penjualan harian apotek." },
  { key: "cuaca", label: "Data Cuaca", icon: CloudSun, title: "Data Cuaca", subtitle: "Variabel cuaca historis wilayah Banjarnegara." },
  { key: "stok", label: "Manajemen Stok", icon: Package, title: "Manajemen Stok", subtitle: "Stok sistem, stok fisik, selisih, dan status persediaan." },
  { key: "pengadaan", label: "Rekomendasi Pengadaan", icon: ClipboardList, title: "Rekomendasi Pengadaan", subtitle: "Usulan pembelian berbasis prediksi permintaan dan stok." },
  { key: "laporan", label: "Laporan", icon: FileText, title: "Laporan", subtitle: "Ringkasan analitik siap ekspor PDF, Excel, dan CSV." },
  { key: "pengaturan", label: "Pengaturan", icon: Settings, title: "Pengaturan", subtitle: "Model, database, tampilan, dan akun aplikasi." },
];

const BOTTOM_NAV: ViewKey[] = ["dashboard", "prediksi", "stok"];

export interface Period { from: string; to: string }

export function AppShell({
  user, view, onViewChange, period, onPeriodChange, onLogout, children,
}: {
  user: UserInfo;
  view: ViewKey;
  onViewChange: (v: ViewKey) => void;
  period: Period;
  onPeriodChange: (p: Period) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<{ id: string; level: string; message: string }[] | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [pwOpen, setPwOpen] = useState(false);
  const current = NAV_ITEMS.find((n) => n.key === view)!;

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    let alive = true;
    api<{ notifications: { id: string; level: string; message: string }[]; alertCount: number }>("/api/notifications")
      .then((res) => { if (alive) { setNotifs(res.notifications); setAlertCount(res.alertCount); } })
      .catch(() => { if (alive) setNotifs([]); });
    return () => { alive = false; };
  }, [view]);

  const loadNotifs = useCallback(async () => {
    await Promise.resolve();
    setNotifs(null);
    try {
      const res = await api<{ notifications: { id: string; level: string; message: string }[]; alertCount: number }>("/api/notifications");
      setNotifs(res.notifications);
      setAlertCount(res.alertCount);
    } catch {
      setNotifs([]);
    }
  }, []);

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/settings/password", {
        method: "POST",
        json: { current: form.get("current"), newPassword: form.get("new") },
      });
      toast.success("Kata sandi berhasil diubah.");
      setPwOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {}
    clearStoredToken();
    onLogout();
  }

  const BellButton = (
    <Popover open={notifOpen} onOpenChange={(o) => { setNotifOpen(o); if (o) loadNotifs(); }}>
      <PopoverTrigger asChild>
        <button className="relative rounded-full p-2 hover:bg-secondary/70 text-foreground" aria-label="Notifikasi">
          <Bell className="size-5" />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-5 h-5 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
              {alertCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 md:w-96 p-0">
        <div className="px-4 py-3 border-b font-semibold text-sm">Notifikasi</div>
        <div className="max-h-80 overflow-y-auto p-2">
          {notifs === null ? (
            <div className="space-y-2 p-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : notifs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Tidak ada notifikasi.</p>
          ) : (
            notifs.map((n) => (
              <div key={n.id} className="flex items-start gap-2 rounded-lg px-3 py-2 hover:bg-muted/60 text-sm">
                {n.level === "KRITIS" ? <AlertCircle className="size-4 text-danger shrink-0 mt-0.5" /> :
                 n.level === "PERLU_PERHATIAN" ? <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" /> :
                 <Info className="size-4 text-info shrink-0 mt-0.5" />}
                <span>{n.message}</span>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );

  const AvatarMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full hover:bg-secondary/70 pr-2 pl-1 py-1" aria-label="Menu pengguna">
          <span className="size-8 rounded-full bg-primary text-primary-foreground font-bold text-sm flex items-center justify-center">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <span className="hidden md:block text-sm font-medium">{user.name}</span>
          <span className="hidden md:inline-flex text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{user.role}</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="font-semibold">{user.name}</div>
          <div className="text-xs text-muted-foreground font-normal">@{user.username} · {user.role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setPwOpen(true)}><KeyRound className="size-4" /> Ganti Kata Sandi</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout} className="text-danger focus:text-danger"><LogOut className="size-4" /> Keluar Aplikasi</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="min-h-screen lg:flex bg-background">
      {/* ============ SIDEBAR DESKTOP ============ */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-[264px] flex-col bg-gradient-to-b from-[#0B5F52] via-[#0B5F52] to-[#087F6B] text-white z-40">
        <svg className="absolute -left-6 bottom-28 w-44 h-44 opacity-[0.06] pointer-events-none" viewBox="0 0 100 100"><path d="M50 5C20 25 10 55 15 90c35 5 65-15 70-45S65 10 50 5Z" fill="#fff"/></svg>
        <svg className="absolute left-24 top-[430px] w-24 h-24 rotate-45 opacity-[0.05] pointer-events-none" viewBox="0 0 100 100"><path d="M50 5C20 25 10 55 15 90c35 5 65-15 70-45S65 10 50 5Z" fill="#fff"/></svg>
        <div className="p-5 pb-4 relative">
          <LogoTitle />
        </div>
        <nav className="flex-1 px-3 space-y-1 overflow-y-auto relative" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => {
            const active = view === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => onViewChange(item.key)}
                aria-current={active ? "page" : undefined}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13.5px] font-medium transition-colors text-left ${
                  active
                    ? "bg-[#0D8A74] text-white shadow-md shadow-black/10 ring-1 ring-white/15"
                    : "text-emerald-50/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className={`size-[18px] shrink-0 ${active ? "text-[#5BD0A9]" : ""}`} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 space-y-3 relative">
          {mounted && (
            <div className="flex items-center gap-1 bg-white/10 rounded-xl p-1 border border-white/10">
              <button
                onClick={() => setTheme("light")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${theme !== "dark" ? "bg-white text-[#0B5F52]" : "text-emerald-50/80 hover:text-white"}`}
              >
                <Sun className="size-3.5" /> Light
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${theme === "dark" ? "bg-white text-[#0B5F52]" : "text-emerald-50/80 hover:text-white"}`}
              >
                <Moon className="size-3.5" /> Dark
              </button>
            </div>
          )}
          <div className="text-[11px] text-emerald-100/70 leading-relaxed">
            <div className="font-semibold text-emerald-50/90">Versi 1.0.0</div>
            <div>© 2026 Apotek Pahala</div>
          </div>
        </div>
      </aside>

      {/* ============ KONTEN ============ */}
      <div className="flex-1 min-w-0 lg:ml-[264px] flex flex-col">
        {/* Header mobile */}
        <header className="lg:hidden sticky top-0 z-30 bg-gradient-to-r from-[#087F6B] to-[#0B5F52] text-white px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo size={34} />
            <div>
              <div className="font-bold leading-tight text-[15px]">Apotek Pahala</div>
              <div className="text-[10px] text-emerald-100/80 leading-tight">Pharmacy Intelligence</div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {BellButton}
            {AvatarMenu}
          </div>
        </header>

        {/* Topbar desktop */}
        <div className="hidden lg:flex items-center justify-between px-8 pt-6 pb-2">
          <div className="flex items-center gap-3">
            <span className="w-1.5 h-9 rounded-full bg-primary" aria-hidden />
            <div>
              <h1 className="text-[22px] font-bold text-foreground leading-tight">{current.title}</h1>
              <p className="text-sm text-muted-foreground">{current.subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <DateRangePicker period={period} onPeriodChange={onPeriodChange} />
            {BellButton}
            {AvatarMenu}
          </div>
        </div>

        {/* Judul di mobile (di dalam konten) */}
        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-4 pb-28 lg:pb-10 w-full max-w-[1400px] mx-auto">
          <div className="lg:hidden mb-4">
            <h1 className="text-xl font-bold text-foreground">{current.title}</h1>
            <p className="text-xs text-muted-foreground">{current.subtitle}</p>
          </div>
          {children}
        </main>
      </div>

      {/* ============ BOTTOM NAV MOBILE ============ */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t shadow-[0_-4px_16px_rgba(24,52,61,0.08)]"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0px)" }}
        aria-label="Navigasi bawah">
        <div className="grid grid-cols-4 h-[62px]">
          <BottomItem icon={Home} label="Beranda" active={view === "dashboard"} onClick={() => onViewChange("dashboard")} />
          <BottomItem icon={TrendingUp} label="Prediksi" active={view === "prediksi"} onClick={() => onViewChange("prediksi")} />
          <BottomItem icon={Package} label="Stok" active={view === "stok"} onClick={() => onViewChange("stok")} />
          <MoreSheet view={view} onViewChange={onViewChange} />
        </div>
      </nav>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ganti Kata Sandi</DialogTitle>
            <DialogDescription>Gunakan kata sandi yang kuat dan mudah Anda ingat.</DialogDescription>
          </DialogHeader>
          <form onSubmit={changePassword} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw-current">Kata Sandi Saat Ini</Label>
              <Input id="pw-current" name="current" type="password" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-new">Kata Sandi Baru</Label>
              <Input id="pw-new" name="new" type="password" required minLength={6} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwOpen(false)}>Batal</Button>
              <Button type="submit">Simpan</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BottomItem({ icon: Icon, label, active, onClick }: { icon: typeof Home; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
        active ? "text-primary" : "text-muted-foreground"
      }`}
    >
      <Icon className={`size-[22px] ${active ? "stroke-[2.2]" : ""}`} />
      {label}
    </button>
  );
}

function MoreSheet({ view, onViewChange }: { view: ViewKey; onViewChange: (v: ViewKey) => void }) {
  const [open, setOpen] = useState(false);
  const others: ViewKey[] = ["penjualan", "cuaca", "pengadaan", "laporan", "pengaturan"];
  const active = others.includes(view);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          aria-current={active ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active ? "text-primary" : "text-muted-foreground"}`}
        >
          <Menu className="size-[22px]" />
          Lainnya
        </button>
      </SheetTrigger>
      <SheetContent side="bottom" className="rounded-t-3xl p-0 max-h-[80vh] overflow-y-auto">
        <SheetHeader className="px-5 pt-5 pb-3 text-left">
          <SheetTitle className="text-base flex items-center gap-2">
            <Menu className="size-4 text-primary" /> Menu Lainnya
          </SheetTitle>
        </SheetHeader>
        <div className="px-3 pb-8 grid grid-cols-1 gap-1">
          {NAV_ITEMS.filter((n) => others.includes(n.key)).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => { onViewChange(item.key); setOpen(false); }}
                className={`flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm font-medium text-left ${
                  view === item.key ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                }`}
              >
                <span className="size-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="size-[18px]" />
                </span>
                <span>
                  {item.label}
                  <span className="block text-xs font-normal text-muted-foreground">{item.subtitle}</span>
                </span>
              </button>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function DateRangePicker({ period, onPeriodChange }: { period: Period; onPeriodChange: (p: Period) => void }) {
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(period.from);
  const [to, setTo] = useState(period.to);

  useEffect(() => { setFrom(period.from); setTo(period.to); }, [period]);

  function apply(p?: Period) {
    const next = p ?? { from, to };
    if (new Date(next.from) > new Date(next.to)) {
      toast.error("Tanggal awal tidak boleh setelah tanggal akhir.");
      return;
    }
    onPeriodChange(next);
    setOpen(false);
  }

  const preset = (label: string, p: Period) => (
    <button key={label} onClick={() => apply(p)}
      className="w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted">
      {label}
      <span className="block text-xs text-muted-foreground">{fmtDate(p.from)} – {fmtDate(p.to)}</span>
    </button>
  );

  const monthPeriod = (y: number, m: number) => {
    const from = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
    const to = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    return { from, to };
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setFrom(period.from); setTo(period.to); } }}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="gap-2 font-medium h-10">
          <CalendarDays className="size-4 text-primary" />
          <span className="hidden sm:inline">{fmtDate(period.from)} – {fmtDate(period.to)}</span>
          <span className="sm:hidden">Periode</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-4">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="dr-from" className="text-xs">Dari</Label>
              <Input id="dr-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dr-to" className="text-xs">Sampai</Label>
              <Input id="dr-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Pilihan cepat</p>
            {preset("Januari 2025 (periode demo mockup)", monthPeriod(2025, 0))}
            {preset("Bulan Ini", monthPeriod(new Date().getFullYear(), new Date().getMonth()))}
            {preset("Bulan Lalu", (() => { const d = new Date(); return monthPeriod(d.getFullYear(), d.getMonth() - 1); })())}
          </div>
          <Button className="w-full" onClick={() => apply()}>Terapkan Periode</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
