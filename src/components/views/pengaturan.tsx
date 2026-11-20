"use client";

import { useCallback, useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { api, fmtDate, num, pct, rp } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ErrorBox } from "@/components/views/dashboard";
import { toast } from "sonner";
import type { UserInfo } from "@/components/login-view";
import {
  BrainCircuit, Database, Sun, Moon, UserRound, Info as InfoIcon, Loader2, HardDriveDownload,
  HardDriveUpload, Save, Plus, ShieldCheck, Cpu, Users, MonitorPlay,
} from "lucide-react";

interface ModelResp {
  settings: { modelName: string; nEstimators: number; maxDepth: number | null; randomState: number; testSplit: number; useWeather: boolean };
  status: {
    trainedAt: string | null;
    dataCoverage: Record<string, { nWeeks: number; firstWeek: string; lastWeek: string; rf: { mae: number; rmse: number; mape: number } }> | null;
    avgMape: number | null; accuracy: number | null;
    featureImportance: Record<string, Record<string, number>> | null;
    medicineCount: number; modelFiles: number;
  };
  evaluations: { id: string; medicineName: string; modelName: string; mae: number; rmse: number; mape: number; trainWeeks: number; testWeeks: number }[];
  recentRuns: { id: string; medicineName: string; periodWeeks: number; createdAt: string; avgDemand: number | null; trend: string | null }[];
}
interface SettingsResp {
  settings: Record<string, string>;
  database: { location: string; sizeBytes: number; connected: boolean; counts: Record<string, number>; backups: { file: string; size: number; createdAt: string }[] };
  app: { name: string; subtitle: string; version: string; devYear: string; tech: string; developer: string; team: string };
}

export function PengaturanView({ user }: { user: UserInfo }) {
  const { theme, setTheme } = useTheme();
  const [model, setModel] = useState<ModelResp | null>(null);
  const [cfg, setCfg] = useState<SettingsResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [training, setTraining] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ nEstimators: "400", maxDepth: "", randomState: "42", testSplit: "0.2", useWeather: true, safetyWeeks: "1", kritisFactor: "0.8" });
  const [restoreFile, setRestoreFile] = useState<string | null>(null);
  const [fontScale, setFontScale] = useState("16px");

  const isAdmin = user.role === "Admin";

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    Promise.all([api<ModelResp>("/api/model"), api<SettingsResp>("/api/settings")])
      .then(([m, s]) => {
        setModel(m);
        setCfg(s);
        setForm({
          nEstimators: String(m.settings.nEstimators),
          maxDepth: m.settings.maxDepth ? String(m.settings.maxDepth) : "",
          randomState: String(m.settings.randomState),
          testSplit: String(m.settings.testSplit),
          useWeather: m.settings.useWeather,
          safetyWeeks: s.settings["proc.safetyWeeks"] ?? "1",
          kritisFactor: s.settings["inventory.kritisFactor"] ?? "0.8",
        });
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    setFontScale(document.documentElement.style.fontSize || "16px");
  }, []);

  async function saveSettings() {
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PUT",
        json: {
          "model.nEstimators": form.nEstimators,
          "model.maxDepth": form.maxDepth,
          "model.randomState": form.randomState,
          "model.testSplit": form.testSplit,
          "model.useWeather": String(form.useWeather),
          "proc.safetyWeeks": form.safetyWeeks,
          "inventory.kritisFactor": form.kritisFactor,
        },
      });
      toast.success("Pengaturan disimpan.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function trainModel() {
    setTraining(true);
    try {
      const res = await api<{ result: { avgMape: number | null; avgMae: number | null }; forecastsGenerated: number }>("/api/model", {
        method: "POST",
        json: {
          nEstimators: Number(form.nEstimators) || 400,
          maxDepth: form.maxDepth ? Number(form.maxDepth) : null,
          randomState: Number(form.randomState) || 42,
          testSplit: Number(form.testSplit) || 0.2,
          useWeather: form.useWeather,
          persistSettings: true,
        },
      });
      toast.success(`Training selesai! MAPE rata-rata ${pct(res.result.avgMape)} · prakiraan awal ${res.forecastsGenerated} obat dibuat.`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTraining(false);
    }
  }

  async function backup() {
    try {
      const res = await api<{ file: string }>("/api/settings", { method: "POST", json: { action: "backup" } });
      toast.success(`Backup dibuat: ${res.file}`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function restore() {
    if (!restoreFile) return;
    try {
      await api("/api/settings", { method: "POST", json: { action: "restore", file: restoreFile } });
      toast.success(`Database dipulihkan dari ${restoreFile}.`);
      setRestoreFile(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function changeFont(v: string) {
    setFontScale(v);
    document.documentElement.style.fontSize = v;
    localStorage.setItem("ap.fontScale", v);
  }

  if (loading) {
    return <div className="space-y-4">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-44 rounded-xl" />)}</div>;
  }
  if (error) return <ErrorBox message={error} onRetry={load} />;

  const topFeatures = model?.status.featureImportance
    ? Object.entries(Object.values(model.status.featureImportance)[0] ?? {}).slice(0, 5)
    : [];
  const coverageVals = Object.values(model?.status.dataCoverage ?? {});
  const dbSize = cfg?.database.sizeBytes ?? 0;

  return (
    <div className="space-y-4">
      {/* Pengaturan Model */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center"><BrainCircuit className="size-4" /></span>
            <h2 className="font-semibold text-[15px]">Pengaturan Model</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Konfigurasi Random Forest Regression dan parameter training.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="space-y-1.5">
              <Label>Model Utama</Label>
              <Input value="Random Forest Regression" disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-nest">Jumlah Pohon (estimators)</Label>
              <Input id="cfg-nest" type="number" min="10" max="2000" value={form.nEstimators} onChange={(e) => setForm({ ...form, nEstimators: e.target.value })} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-depth">Max Depth (kosong = otomatis)</Label>
              <Input id="cfg-depth" type="number" min="2" max="100" value={form.maxDepth} onChange={(e) => setForm({ ...form, maxDepth: e.target.value })} placeholder="otomatis" disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-rs">Random State</Label>
              <Input id="cfg-rs" type="number" min="0" value={form.randomState} onChange={(e) => setForm({ ...form, randomState: e.target.value })} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-split">Porsi Data Uji (0.1–0.5)</Label>
              <Input id="cfg-split" type="number" step="0.05" min="0.1" max="0.5" value={form.testSplit} onChange={(e) => setForm({ ...form, testSplit: e.target.value })} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-safety">Stok Pengaman (pekan)</Label>
              <Input id="cfg-safety" type="number" min="0" max="4" step="0.5" value={form.safetyWeeks} onChange={(e) => setForm({ ...form, safetyWeeks: e.target.value })} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cfg-kritis">Faktor Kritis Stok (0–1)</Label>
              <Input id="cfg-kritis" type="number" step="0.05" min="0.05" max="0.95" value={form.kritisFactor} onChange={(e) => setForm({ ...form, kritisFactor: e.target.value })} disabled={!isAdmin} />
            </div>
            <div className="space-y-1.5">
              <Label>Gunakan Fitur Cuaca</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch id="cfg-weather" checked={form.useWeather} onCheckedChange={(v) => setForm({ ...form, useWeather: v })} disabled={!isAdmin} />
                <span className="text-sm text-muted-foreground">{form.useWeather ? "Suhu, curah hujan, kelembapan" : "Tanpa variabel cuaca"}</span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            {isAdmin && (
              <>
                <Button onClick={trainModel} disabled={training}>
                  {training ? <><Loader2 className="size-4 animate-spin" /> Melatih model…</> : <><Cpu className="size-4" /> Training Model</>}
                </Button>
                <Button variant="outline" onClick={saveSettings} disabled={saving}>
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Simpan Pengaturan
                </Button>
              </>
            )}
            <div className="text-xs text-muted-foreground lg:ml-auto">
              {model?.status.trainedAt ? (
                <>Terakhir dilatih: <span className="font-medium text-foreground">{fmtDate(model.status.trainedAt, "datetime")}</span></>
              ) : "Model belum pernah dilatih."}
            </div>
          </div>

          {/* Status model */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
            <MiniStat label="MAPE Rata-rata (RF)" value={model?.status.avgMape != null ? pct(model.status.avgMape) : "-"} />
            <MiniStat label="Akurasi (100 − MAPE)" value={model?.status.accuracy != null ? pct(model.status.accuracy) : "-"} />
            <MiniStat label="Cakupan Data" value={coverageVals.length ? `${coverageVals[0].nWeeks} pekan/obat` : "-"} />
            <MiniStat label="Model Terlatih" value={`${model?.status.modelFiles ?? 0} obat`} />
          </div>
          {topFeatures.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Fitur terpenting model (feature importance):</p>
              <div className="space-y-1.5 max-w-md">
                {topFeatures.map(([f, v]) => (
                  <div key={f} className="flex items-center gap-2 text-xs">
                    <span className="w-28 text-muted-foreground truncate">{f}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${(v / (topFeatures[0][1] || 1)) * 100}%` }} />
                    </div>
                    <span className="w-12 text-right text-muted-foreground">{(v * 100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Database */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="size-8 rounded-lg bg-info/10 text-info flex items-center justify-center"><Database className="size-4" /></span>
            <h2 className="font-semibold text-[15px]">Data &amp; Database</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">SQLite lokal — tidak diekspos ke internet. Akses data hanya melalui API terautentikasi.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Lokasi Database</p>
              <p className="font-medium break-all text-[13px]">{cfg?.database.location}</p>
            </div>
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Status &amp; Ukuran</p>
              <p className="font-medium flex items-center gap-2">
                <Badge className="bg-success/10 text-success border-success/30" variant="outline">Terhubung</Badge>
                {(dbSize / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            {isAdmin && (
              <>
                <Button variant="outline" onClick={backup}><HardDriveDownload className="size-4" /> Backup Sekarang</Button>
                {cfg?.database.backups.map((b) => (
                  <Button key={b.file} variant="outline" size="sm" className="text-xs" onClick={() => setRestoreFile(b.file)}>
                    <HardDriveUpload className="size-3.5" /> Pulihkan {b.file.replace("backup-", "").replace(".db", "")}
                  </Button>
                ))}
              </>
            )}
          </div>
          {cfg && cfg.database.backups.length > 0 && (
            <div className="mt-3 text-xs text-muted-foreground">
              {cfg.database.backups.length} berkas backup tersimpan di folder <code className="bg-muted px-1 rounded">backups/</code>.
              Restore membuat salinan pengaman database saat ini terlebih dahulu.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tampilan */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="size-8 rounded-lg bg-violet-brand/10 text-violet-brand flex items-center justify-center"><MonitorPlay className="size-4" /></span>
            <h2 className="font-semibold text-[15px]">Tampilan Aplikasi</h2>
          </div>
          <p className="text-xs text-muted-foreground mb-4">Tema dan ukuran teks mengikuti preferensi perangkat ini.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tema</Label>
              <RadioGroup value={theme === "dark" ? "dark" : theme === "system" ? "auto" : "light"}
                onValueChange={(v) => setTheme(v === "auto" ? "system" : v)} className="flex flex-wrap gap-3">
                {[
                  { v: "light", label: "Light", icon: Sun },
                  { v: "dark", label: "Dark", icon: Moon },
                  { v: "auto", label: "Auto", icon: MonitorPlay },
                ].map((t) => (
                  <Label key={t.v} htmlFor={`theme-${t.v}`}
                    className="flex items-center gap-2 rounded-lg border px-4 py-2.5 cursor-pointer has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-accent text-sm font-normal">
                    <RadioGroupItem value={t.v} id={`theme-${t.v}`} />
                    <t.icon className="size-4 text-muted-foreground" /> {t.label}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label htmlFor="font-size">Ukuran Font</Label>
              <select id="font-size" value={fontScale} onChange={(e) => changeFont(e.target.value)}
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm">
                <option value="15px">Kecil</option>
                <option value="16px">Normal</option>
                <option value="18px">Besar</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Akun */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="size-8 rounded-lg bg-success/10 text-success flex items-center justify-center"><UserRound className="size-4" /></span>
            <h2 className="font-semibold text-[15px]">Akun</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm mt-3">
            <div className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">Profil</p>
              <p className="font-medium">{user.name} (@{user.username})</p>
              <Badge variant="outline" className="mt-1 bg-primary/10 text-primary border-primary/30">
                <ShieldCheck className="size-3" /> {user.role}
              </Badge>
            </div>
            <div className="rounded-lg border p-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Kelola Akun</p>
                <p className="font-medium">Pengguna &amp; Hak Akses</p>
              </div>
              {isAdmin && <UsersDialog onChanged={load} />}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Informasi Aplikasi */}
      <Card>
        <CardContent className="p-4 lg:p-5">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center"><InfoIcon className="size-4" /></span>
            <h2 className="font-semibold text-[15px]">Informasi Aplikasi</h2>
          </div>
          <div className="text-sm space-y-1.5">
            <p><span className="text-muted-foreground">Nama:</span> <span className="font-medium">{cfg?.app.name} — {cfg?.app.subtitle}</span></p>
            <p><span className="text-muted-foreground">Versi:</span> <span className="font-medium">{cfg?.app.version}</span></p>
            <p><span className="text-muted-foreground">Teknologi:</span> <span className="font-medium text-[13px]">{cfg?.app.tech}</span></p>
            <p><span className="text-muted-foreground">Tahun Pengembangan:</span> <span className="font-medium">{cfg?.app.devYear}</span></p>
            <p><span className="text-muted-foreground">Pengembang:</span> <span className="font-medium text-[13px]">{cfg?.app.developer}</span></p>
            <p className="text-[13px] text-muted-foreground">Tim Capstone: {cfg?.app.team}</p>
          </div>
        </CardContent>
      </Card>

      {/* Konfirmasi restore */}
      <AlertDialog open={!!restoreFile} onOpenChange={(o) => !o && setRestoreFile(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pulihkan database dari backup?</AlertDialogTitle>
            <AlertDialogDescription>
              Database saat ini akan ditimpa dengan berkas {restoreFile}. Salinan pengaman dibuat otomatis sebelum pemulihan.
              Tindakan ini tidak dapat dibatalkan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={restore}>Ya, Pulihkan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="font-bold text-foreground text-lg">{value}</p>
    </div>
  );
}

function UsersDialog({ onChanged }: { onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<{ id: string; username: string; name: string; role: string; isActive: boolean }[] | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ username: "", name: "", password: "", role: "Petugas" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function loadUsers() {
    setUsers(null);
    try {
      const res = await api<{ users: NonNullable<typeof users> }>("/api/settings/users");
      setUsers(res.users);
    } catch (e) {
      toast.error((e as Error).message);
      setUsers([]);
    }
  }

  function openDialog() {
    setOpen(true);
    loadUsers();
  }

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!form.username.trim() || !form.name.trim() || form.password.length < 6) {
      return setErr("Lengkapi data. Kata sandi minimal 6 karakter.");
    }
    setSaving(true);
    try {
      await api("/api/settings/users", { method: "POST", json: form });
      toast.success("Akun baru dibuat.");
      setAddOpen(false);
      setForm({ username: "", name: "", password: "", role: "Petugas" });
      loadUsers();
      onChanged();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: { id: string; isActive: boolean }) {
    try {
      await api("/api/settings/users", { method: "PATCH", json: { id: u.id, isActive: !u.isActive } });
      loadUsers();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog}><Users className="size-4" /> Kelola</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Kelola Akun Pengguna</DialogTitle>
            <DialogDescription>Admin mengelola akun; kata sandi tersimpan sebagai hash scrypt, bukan teks biasa.</DialogDescription>
          </DialogHeader>
          {!users ? (
            <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div key={u.id} className="rounded-lg border p-3 flex items-center gap-2 text-sm">
                  <span className="size-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs">{u.name.charAt(0)}</span>
                  <div className="min-w-0">
                    <p className="font-medium">{u.name} <span className="text-xs text-muted-foreground">@{u.username}</span></p>
                    <Badge variant="outline" className="text-[10px] mt-0.5">{u.role}</Badge>
                  </div>
                  <button onClick={() => toggleActive(u)}
                    className={`ml-auto text-xs px-2.5 py-1 rounded-full border ${u.isActive ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground"}`}>
                    {u.isActive ? "Aktif" : "Nonaktif"}
                  </button>
                </div>
              ))}
              <Button variant="outline" className="w-full" onClick={() => setAddOpen(true)}><Plus className="size-4" /> Tambah Akun</Button>
            </div>
          )}

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Tambah Akun</DialogTitle>
              </DialogHeader>
              <form onSubmit={addUser} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="u-username">Nama Pengguna</Label>
                  <Input id="u-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-name">Nama Lengkap</Label>
                  <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="u-pass">Kata Sandi</Label>
                  <Input id="u-pass" type="password" minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
                </div>
                <div className="space-y-1.5">
                  <Label>Peran</Label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="h-10 w-full rounded-lg border bg-card px-3 text-sm">
                    <option value="Admin">Admin</option>
                    <option value="Petugas">Petugas</option>
                  </select>
                </div>
                {err && <p className="text-sm text-destructive">{err}</p>}
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
                  <Button type="submit" disabled={saving}>{saving && <Loader2 className="size-4 animate-spin" />} Buat Akun</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </>
  );
}
