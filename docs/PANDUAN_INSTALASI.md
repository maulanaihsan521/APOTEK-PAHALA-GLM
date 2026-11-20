# Panduan Instalasi & Deployment — Apotek Pahala

## 1. Persyaratan Perangkat

| Komponen | Persyaratan |
|---|---|
| Komputer server | Windows 10/11, macOS, atau Linux; RAM >= 4 GB; ruang disk >= 1 GB |
| Runtime web | Node.js >= 20 (atau Bun >= 1.1) |
| Python | 3.10+ |
| Browser | Chrome/Edge/Firefox/Safari terbaru (desktop & Android/iOS) |
| Jaringan | Perangkat mobile satu jaringan lokal dengan komputer server |

## 2. Instalasi

```bash
# a. Dependensi aplikasi web
bun install          # atau: npm install

# b. Library Python untuk pipeline ML & laporan
pip install pandas numpy scikit-learn joblib openpyxl reportlab matplotlib

# c. Skema database SQLite
bun run db:push

# d. (Opsional) data demonstrasi berlabel DEMO
bun run scripts/seed.ts
```

## 3. Konfigurasi Environment

Buat `.env` di root proyek:

```env
DATABASE_URL=file:/jalur/absolut/proyek/db/custom.db
# Opsional: secret sesi (bila tidak diisi, dibuat otomatis di storage/.session_secret)
# SESSION_SECRET=ganti-dengan-string-acak-panjang
# PYTHON_BIN=python3
```

> Jangan menaruh secret di dalam source code.

## 4. Menjalankan

```bash
bun run dev     # mode pengembangan, port 3000
# atau produksi:
bun run build && bun run start
```

## 5. Mengakses dari Smartphone (jaringan lokal)

1. Cari IP komputer server, mis. `192.168.1.10` (`ipconfig` di Windows).
2. Jalankan server dengan host semua antarmuka: `bun run dev -- -H 0.0.0.0`.
3. Buka di smartphone: `http://192.168.1.10:3000`.
4. Tampilan mobile otomatis aktif: header hijau, KPI 2x2, bottom navigation
   (Beranda - Prediksi - Stok - Lainnya).
5. Aplikasi dapat dipasang sebagai PWA ("Add to Home Screen").

## 6. Alur Pertama Kali

1. Masuk sebagai `admin / admin123` (segera ganti kata sandi di Pengaturan - Akun).
2. **Pengaturan - Pengaturan Model - Training Model**: membangun model RF/DT/LR untuk
   seluruh obat, menyimpan evaluasi (MAE/RMSE/MAPE), dan membuat prakiraan 4 pekan awal.
3. Impor data sebenarnya: **Data Penjualan - Impor** dan **Data Cuaca - Impor**
   (template di `public/datasets/`).
4. **Rekomendasi Pengadaan - Buat Rekomendasi Pengadaan**.

## 7. Backup & Restore

- **Pengaturan - Data & Database - Backup Sekarang**: menyalin `db/custom.db` ke
  `backups/backup-<tanggal>.db`.
- **Restore**: pilih berkas backup, konfirmasi; sistem membuat salinan pengaman sebelum menimpa.
- Backup rutin disarankan harian/mingguan.

## 8. Build Desktop Windows (EXE)

Aplikasi web dapat dikemas menjadi aplikasi desktop:

```bash
# Opsi ringan: jendela Chromium terhadap localhost:3000 (Nativefier/Electron wrapper)
npx nativefier --name "Apotek Pahala" --icon public/icons/icon-512.png http://localhost:3000

# Opsi produksi web:
bun run build && bun run start
```

Alternatif desktop berbasis PySide6 (menuju database SQLite yang sama) dapat dikembangkan
dari modul `ml/pipeline.py` tanpa mengubah skema.

## 9. Pemecahan Masalah

| Gejala | Penanganan |
|---|---|
| "Model belum dilatih" saat prediksi | Jalankan Training Model di Pengaturan (Admin) |
| Impor gagal banyak baris | Baca laporan kesalahan per baris; pastikan obat terdaftar & kolom sesuai template |
| Grafik kosong | Belum ada data pada rentang tanggal; ubah filter periode |
| Tidak bisa akses dari HP | Satu jaringan, buka firewall port 3000, jalankan server dengan -H 0.0.0.0 |
| Metrik tidak muncul setelah impor data | Jalankan ulang Training Model agar evaluasi mengikuti data baru |
