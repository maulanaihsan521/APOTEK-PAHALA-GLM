# Dokumentasi API — Apotek Pahala

Semua endpoint memerlukan autentikasi sesi (cookie `ap_session`, httpOnly) kecuali
`POST /api/auth/login`. Respon JSON; kesalahan berbentuk `{ "error": string, "code": string }`.
Akses berbasis peran: **Admin** (penuh) dan **Petugas** (transaksi, stok, lihat rekomendasi/laporan).

## Autentikasi
| Endpoint | Metode | Body | Keterangan |
|---|---|---|---|
| `/api/auth/login` | POST | `{username, password}` | Set cookie sesi 7 hari |
| `/api/auth/logout` | POST | - | Hapus sesi |
| `/api/auth/me` | GET | - | Profil pengguna aktif |

Kata sandi disimpan sebagai hash **scrypt** (salt acak per pengguna).

## Dashboard & Notifikasi
- `GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD&range=4|12|52` — KPI, tren aktual vs prediksi,
  ringkasan prediksi, top-5 obat, status persediaan, aktivitas.
- `GET /api/notifications` — peringatan stok + aktivitas terbaru (`alertCount`).
- `GET /api/activity?take=10` — log aktivitas.

## Data Penjualan (`Sale`)
- `GET /api/sales?search&from&to&medicineId&mutation=P|R&sort&dir&page&pageSize`
  → `{rows, total, summary:{units, revenue}}`
- `POST /api/sales` — `{date, medicineId, quantity, unitPrice, mutation:"P"|"R"}`
  (R otomatis bernilai negatif; validasi nol/negatif/tanggal)
- `PATCH /api/sales/{id}` · `DELETE /api/sales/{id}` (Admin)
- `POST /api/sales/import` — `{format:"csv"|"xlsx", content, mode:"preview"|"commit"}`
  → validasi per baris, deteksi duplikat, laporan kesalahan
- `GET /api/sales/export?format=csv|xlsx&from&to&medicineId`

## Data Cuaca (`WeatherData`)
- `GET /api/weather?from&to&page&pageSize` — KPI (suhu/hujan/kelembapan), tren mingguan, meta sumber
- `POST /api/weather/import` — kolom `tanggal, suhu_c, curah_hujan_mm, kelembapan` (upsert per tanggal)
- `GET /api/weather/export?format=csv|xlsx`

## Obat & Stok
- `GET /api/medicines` — daftar obat + stok + status
- `POST /api/medicines` (Admin) — `{code, name, category, unit, basePrice, minStock, stockSystem?, stockPhysical?}`
- `PATCH/DELETE /api/medicines/{id}` (Admin; DELETE = nonaktifkan)
- `GET /api/inventory?search&status` — `{items, summary}`
- `POST /api/inventory/adjust` — `{medicineId, type:"PENERIMAAN"|"PENGURANGAN"|"PENYESUAIAN", delta|newSystem, note}`
- `POST /api/inventory/opname` — `{items:[{medicineId, stockPhysical}]}` atau tunggal
- `GET /api/inventory/movements?medicineId&take` — riwayat perubahan stok

Status stok (dapat dikonfigurasi): **Aman** `stok >= minimum` · **Kritis** `stok < kritisFactor × minimum`
· **Perlu Perhatian** selainnya.

## Prediksi & Model (Machine Learning)
- `POST /api/predict` — `{medicineId, weeks:1|2|4|8|12}`
  → menjalankan `ml/pipeline.py predict` (Random Forest, rekursi lag, skenario cuaca normal iklim),
  menyimpan `PredictionRun` + `PredictionResult`, mencatat aktivitas.
- `GET /api/predict?medicineId&weeks` — run terakhir untuk obat tersebut.
- `GET /api/model` — status model, evaluasi seluruh obat (RF/DT/LR/Naif), fitur terpenting,
  cakupan data, riwayat run.
- `POST /api/model` (Admin) — `{nEstimators?, maxDepth?, randomState?, testSplit?, useWeather?, persistSettings?}`
  → training ulang seluruh obat + prakiraan 4 pekan awal. Metrik **MAE/RMSE/MAPE** dihitung
  pada data uji kronologis; MAPE hanya pada pekan berpermintaan positif.

## Rekomendasi Pengadaan
- `GET /api/procurement` — rekomendasi aktif + riwayat.
- `POST /api/procurement` — `{weeks:4}` — hitung semua obat:
  `kebutuhan = prakiraan + stok pengaman − stok`; `beli = max(0, kebutuhan)` dibulatkan ke satuan beli;
  urgensi dari cakupan stok (Kritis < 0,5 pekan · Tinggi < 1 · Sedang < 2 · Rendah >= 2).
- `PATCH /api/procurement` — `{action:"adjust", itemId, adjustedQty, reason}` |
  `{action:"approve"|"cancel", id}`.

## Laporan & Ekspor
- `GET /api/reports?type=penjualan|permintaan|prediksi|evaluasi|stok|pengadaan&from&to`
  → `{summary, chart, table, insight}`
- `GET /api/reports/export?type=...&format=pdf|xlsx|csv` — PDF berlogo + nomor halaman (ReportLab).

## Pengaturan & Sistem
- `GET /api/settings` (Admin) — pengaturan, info database (lokasi, ukuran, backup), info aplikasi.
- `PUT /api/settings` (Admin) — validasi: pohon 10–2000, max depth 2–100, test split 0.1–0.5,
  stok pengaman 0–4 pekan, kritisFactor 0–1.
- `POST /api/settings` — `{action:"backup"}` | `{action:"restore", file}` (Admin).
- `GET/POST/PATCH /api/settings/users` (Admin) — kelola akun (hash scrypt).
- `POST /api/settings/password` — ganti kata sandi akun aktif.
