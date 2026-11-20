# Apotek Pahala — Pharmacy Intelligence

**Solusi Analitik untuk Persediaan Obat yang Lebih Tepat.**

Aplikasi sistem informasi & analitik farmasi untuk **Apotek Pahala, Kabupaten Banjarnegara**:
prediksi permintaan obat berbasis **data penjualan historis + faktor cuaca** menggunakan
**Random Forest Regression**, lengkap dengan manajemen stok, rekomendasi pengadaan,
laporan ekspor, dan dashboard responsif (desktop sidebar + mobile bottom navigation).

> Proyek **Capstone Design Project** — S1 Sistem Informasi, Fakultas Rekayasa Industri,
> Universitas Telkom Purwokerto 2026.
> Tim: 2311103005 Naila Syakirotul Rizkiyah · 2311103029 Muhammad Rafly Adittana · 2311103015 Maulana Ihsan Rohim

---

## ✨ Fitur Utama (8 Modul)

| Modul | Fungsi |
|---|---|
| **1. Ringkasan Dashboard** | 4 KPI (Total Penjualan, Total Permintaan, Obat Prioritas, MAPE Model) — semua dihitung dari database; grafik tren penjualan & prediksi (filter 4 Minggu / 12 Minggu / 1 Tahun); Ringkasan Prediksi 4 pekan; Top 5 obat dengan sparkline; Status Persediaan (Aman/Perlu Perhatian/Kritis); Aktivitas Terbaru |
| **2. Prediksi Permintaan** | Pilih obat + periode (1/2/4/8/12 minggu) → pipeline Random Forest berjalan nyata; KPI permintaan rata-rata, prediksi minggu depan, MAPE; grafik prakiraan; tabel prediksi per pekan; Informasi Model; **Perbandingan Algoritma** (RF vs Decision Tree vs Linear Regression vs Naif) dengan MAE/RMSE/MAPE |
| **3. Data Penjualan** | CRUD transaksi (mutasi P/R sesuai arsip BL), pencarian, filter tanggal/obat/mutasi, sortir kolom, paginasi, **impor CSV/Excel dengan wizard** (pratinjau → validasi → commit, laporan kesalahan per baris, deteksi duplikat), ekspor CSV/Excel |
| **4. Data Cuaca** | Suhu, curah hujan, kelembapan harian (sumber: NASA POWER MERRA-2, koordinat Banjarnegara); KPI + grafik tren mingguan (kombinasi bar/line); tabel harian; impor CSV/Excel tervalidasi; ekspor |
| **5. Manajemen Stok** | Stok sistem vs fisik (stock opname ST), selisih, status berbasis stok minimum **yang dapat dikonfigurasi**; penyesuaian stok + stock opname; **riwayat perubahan stok** lengkap; tambah/ubah obat; filter status; ekspor |
| **6. Rekomendasi Pengadaan** | Logika transparan: `kebutuhan bersih = prakiraan N pekan + stok pengaman − stok tersedia`; jumlah = maks(0, kebutuhan), dibulatkan ke satuan pembelian; urgensi Kritis/Tinggi/Sedang/Rendah; setujui/batalkan; ubah jumlah dengan alasan; riwayat; ekspor PDF/Excel |
| **7. Laporan** | 6 jenis laporan (Penjualan, Permintaan, Prediksi, Evaluasi Model, Stok, Pengadaan) dengan ringkasan, grafik, tabel, insight — **ekspor PDF (logo + nomor halaman), Excel, CSV** |
| **8. Pengaturan** | Parameter model (jumlah pohon, max depth, random state, porsi data uji, fitur cuaca) + tombol **Training Model**; backup & restore database; tema Light/Dark/Auto + ukuran font; profil & ganti kata sandi; kelola akun (Admin/Petugas); informasi aplikasi |

### Machine Learning (sesuai metodologi laporan Capstone)

- Agregasi mingguan Senin–Minggu; permintaan **neto = penjualan (P) − |retur (R)|**
- Fitur: **lag 1–8 pekan, lag 52 pekan, rata-rata bergulir 4/8/12, deviasi bergulir 4,**
  nomor pekan ISO + transformasi sinusoidal musiman, bulan, **dan cuaca (suhu, curah hujan, kelembapan)**
- Pemisahan data **kronologis** (tanpa pengacakan → tidak ada kebocoran data masa depan)
- Model utama **Random Forest Regression** (bawaan 400 pohon, dapat diubah), pembanding
  **Decision Tree Regression, Linear Regression, dan Naif (lag-1)**
- Metrik **MAE, RMSE, MAPE** (MAPE hanya pada pekan berpermintaan positif)
- Prakiraan horizon N pekan dengan **rekursi lag** dan **skenario cuaca normal iklim per nomor pekan**
- Pekan terakhir yang belum lengkap 7 hari otomatis dikeluarkan dari deret
- Seluruh metrik dihitung oleh pipeline (`ml/pipeline.py`) — **tidak ada angka akurasi yang diisi manual**

---

## 🚀 Menjalankan Aplikasi

### Prasyarat
- Node.js ≥ 20 / Bun ≥ 1.1 (sudah termasuk di lingkungan ini)
- Python 3.10+ dengan `pandas`, `numpy`, `scikit-learn`, `joblib`, `openpyxl`, `reportlab`, `matplotlib`

### Langkah

```bash
# 1. Dependensi frontend/backend
bun install          # atau: npm install

# 2. Skema database (SQLite)
bun run db:push

# 3. (Opsional) Isi data demonstrasi berlabel DEMO
bun run scripts/seed.ts

# 4. Jalankan server
bun run dev          # http://localhost:3000

# 5. Latih model + buat prakiraan awal (via UI: Pengaturan → Training Model)
#    atau lewat API:
#    POST /api/model   (login sebagai Admin terlebih dahulu)
```

**Akun demo:** `admin / admin123` (Admin) · `petugas / petugas123` (Petugas)

### Arsitektur

```
┌─────────────────────────────────────────────────────────────┐
│  Next.js 16 (App Router, TypeScript, Tailwind 4, shadcn/ui) │
│  ─ Desktop: sidebar hijau permanen  ─ Mobile: bottom nav    │
│  Recharts · PWA manifest · Dark mode                        │
├─────────────────────────────────────────────────────────────┤
│  REST API (route handlers) — autentikasi sesi HMAC + scrypt │
│  /api/auth · /api/dashboard · /api/sales · /api/weather     │
│  /api/inventory · /api/predict · /api/model · /api/procurement
│  /api/reports · /api/settings · /api/notifications          │
├──────────────────────────────────┬──────────────────────────┤
│  Prisma ORM → SQLite (db/custom.db) │  ML: ml/pipeline.py   │
│  15 tabel (lihat prisma/schema.prisma) │ scikit-learn RF/DT/LR
└──────────────────────────────────┴──────────────────────────┘
```

- **Database (15 tabel):** Role, User, Medicine, Sale, WeatherData, Inventory,
  InventoryMovement, PredictionRun, PredictionResult, ModelEvaluation, TestPrediction,
  ProcurementRecommendation, ProcurementItem, ApplicationSetting, ActivityLog.
- **Mobile & desktop memakai backend + database yang sama** (satu aplikasi responsif).
- Database lokal (SQLite) tidak diekspos ke internet; semua akses data lewat API terautentikasi.

### Struktur Folder

```
├── prisma/schema.prisma      # skema database
├── scripts/seed.ts           # seeder data demo (kalibrasi KPI mockup)
├── scripts/report_pdf.py     # generator laporan PDF (ReportLab)
├── ml/pipeline.py            # pipeline CRISP-DM (train + predict)
├── ml/io_xlsx.py             # impor/ekspor Excel (openpyxl)
├── models/                   # model terlatih (.joblib per obat)
├── storage/ml/               # hasil training/prakiraan (JSON)
├── datasets/                 # template impor CSV
├── public/datasets/          # template yang dapat diunduh dari UI
├── backups/                  # berkas backup database
└── src/
    ├── app/page.tsx          # titik masuk tunggal (login + 8 modul)
    ├── app/api/**            # REST API
    ├── components/views/**   # 8 tampilan modul
    ├── components/app-shell.tsx  # sidebar desktop + bottom nav mobile
    └── lib/                  # auth, ml bridge, helper
```

## 🔌 Ringkasan API

| Endpoint | Metode | Keterangan |
|---|---|---|
| `/api/auth/login` `/logout` `/me` | POST/GET | Autentikasi sesi (cookie httpOnly) |
| `/api/dashboard?from&to&range` | GET | KPI, tren, top-5, status stok, aktivitas |
| `/api/sales` (+`/[id]`) | GET/POST/PATCH/DELETE | CRUD transaksi + filter/sort/paginasi |
| `/api/sales/import` | POST | Impor penjualan (mode preview/commit) |
| `/api/sales/export?format=csv\|xlsx` | GET | Ekspor penjualan |
| `/api/weather` (+`/import` `/export`) | GET/POST | Data cuaca + impor/ekspor |
| `/api/medicines` (+`/[id]`) | GET/POST/PATCH/DELETE | Master obat |
| `/api/inventory` (+`/adjust` `/opname` `/movements`) | GET/POST | Stok & riwayat |
| `/api/predict` | POST/GET | Jalankan prediksi / ambil run terakhir |
| `/api/model` | GET/POST | Status & evaluasi model / training |
| `/api/procurement` | GET/POST/PATCH | Rekomendasi pengadaan |
| `/api/reports` (+`/export`) | GET | Data & ekspor laporan PDF/Excel/CSV |
| `/api/settings` (+`/users` `/password`) | GET/PUT/POST/PATCH | Pengaturan, backup/restore, akun |
| `/api/activity` `/notifications` | GET | Log aktivitas & notifikasi |

Dokumentasi lengkap: [docs/PANDUAN_INSTALASI.md](docs/PANDUAN_INSTALASI.md) · [docs/API.md](docs/API.md)

## ⚠️ Catatan Data & Asumsi

1. **Data demonstrasi berlabel DEMO** dibangkitkan deterministik untuk menguji UI
   (kalibrasi agar KPI sesuai mockup desain: Januari 2025 = Rp 24,8 jt / 1.284 unit;
   cuaca Jan 2025 ≈ 27,6 °C / 125 mm / 82%). Data ini **bukan** data arsip asli apotek dan
   tidak dipakai sebagai hasil penelitian.
2. Seluruh **metrik model dihitung nyata** oleh pipeline scikit-learn pada data demo tersebut.
3. Nilai cuaca pada horizon prediksi memakai **skenario normal iklim** per nomor pekan
   (cuaca masa depan belum tersedia) — ditampilkan sebagai keterangan di UI.
4. Lead time pemasok belum tersedia → asumsi pengadaan (stok pengaman 1 pekan, cakupan 4 pekan)
   dapat diubah di Pengaturan; keputusan akhir tetap pada manajemen apotek.
5. Untuk data penelitian sesungguhnya, gunakan wizard **Impor** (template di `datasets/`).

## 🎨 Identitas Visual

Palet brand: Primary `#087F6B` · Secondary `#0B5F52` · Accent `#20B58A` · Background `#F5F8FA`
· Surface `#FFFFFF` · Text `#18343D` / `#718096` · Border `#E3EBEF` · Success `#16A36A` ·
Warning `#F2A93B` · Danger `#E55353` · Info `#3985D6`. Tipografi Inter. Kartu radius 12–18 px,
shadow tipis, sidebar hijau gelap (desktop), bottom navigation (mobile), skeleton loading,
empty state, toast, dan dialog konfirmasi di seluruh modul.

© 2026 Apotek Pahala — Capstone Design Project, Universitas Telkom Purwokerto.
