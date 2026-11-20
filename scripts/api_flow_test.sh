#!/usr/bin/env bash
# Uji alur bisnis: prediksi, penjualan CRUD, stok adjust, rekomendasi, laporan, settings
set -e
BASE="http://localhost:3000"
JAR="/tmp/apotek_admin.jar"
JAR2="/tmp/apotek_petugas.jar"
OUT=/tmp/api_out.json

jsonget() { python3 -c "import sys,json;d=json.load(sys.stdin);print(eval('d'+sys.argv[1]))" "$1" 2>/dev/null; }

MEDID=$(curl -s -b "$JAR" "$BASE/api/medicines" | jsonget "['medicines'][0]['id']")
MEDID2=$(curl -s -b "$JAR" "$BASE/api/medicines" | jsonget "['medicines'][1]['id']")
echo "MEDID=$MEDID / MEDID2=$MEDID2"

t() { # label, method, path, jar, body(optional)
  local label="$1" method="$2" path="$3" jar="$4" body="$5"
  local code
  if [ -n "$body" ]; then
    code=$(curl -s -o $OUT -w "%{http_code}" -b "$jar" -X "$method" "$BASE$path" -H "Content-Type: application/json" -d "$body" --max-time 90)
  else
    code=$(curl -s -o $OUT -w "%{http_code}" -b "$jar" -X "$method" "$BASE$path" --max-time 90)
  fi
  echo "[$code] $label"
  if [ "$code" -ge 400 ]; then head -c 250 $OUT; echo; fi
}

echo "--- PREDIKSI ---"
t "POST /api/predict 4w" POST "/api/predict" "$JAR" "{\"medicineId\":\"$MEDID\",\"weeks\":4}"
t "GET /api/predict?medicineId&weeks=4" GET "/api/predict?medicineId=$MEDID&weeks=4" "$JAR"
t "POST /api/predict weeks invalid(7→default 4)" POST "/api/predict" "$JAR" "{\"medicineId\":\"$MEDID\",\"weeks\":7}"

echo "--- PENJUALAN CRUD ---"
t "POST /api/sales (valid)" POST "/api/sales" "$JAR" "{\"date\":\"2025-01-20\",\"medicineId\":\"$MEDID\",\"quantity\":5,\"unitPrice\":32000,\"mutation\":\"P\"}"
t "POST /api/sales (negatif P, expect 400)" POST "/api/sales" "$JAR" "{\"date\":\"2025-01-20\",\"medicineId\":\"$MEDID\",\"quantity\":-3,\"unitPrice\":32000,\"mutation\":\"P\"}"
t "POST /api/sales (retur R)" POST "/api/sales" "$JAR" "{\"date\":\"2025-01-21\",\"medicineId\":\"$MEDID\",\"quantity\":2,\"unitPrice\":32000,\"mutation\":\"R\"}"
t "POST /api/sales (obat hantu, expect 400)" POST "/api/sales" "$JAR" "{\"date\":\"2025-01-20\",\"medicineId\":\"xxxx\",\"quantity\":1,\"unitPrice\":1000,\"mutation\":\"P\"}"

echo "--- STOK ---"
t "POST /api/inventory/adjust" POST "/api/inventory/adjust" "$JAR" "{\"medicineId\":\"$MEDID2\",\"delta\":-3,\"note\":\"Uji rusak\"}"
t "GET /api/inventory/movements" GET "/api/inventory/movements" "$JAR"
t "POST /api/inventory/opname" POST "/api/inventory/opname" "$JAR" "{\"medicineId\":\"$MEDID2\",\"physical\":80,\"note\":\"Opname uji\"}"

echo "--- REKOMENDASI ---"
t "POST /api/procurement (generate)" POST "/api/procurement" "$JAR" '{"weeks":4}'
RECID=$(curl -s -b "$JAR" "$BASE/api/procurement" | jsonget "['recommendation']['id']")
ITEMID=$(curl -s -b "$JAR" "$BASE/api/procurement" | jsonget "['recommendation']['items'][0]['id']")
echo "REC=$RECID ITEM=$ITEMID"
t "PATCH adjust item tanpa alasan (expect 400)" PATCH "/api/procurement" "$JAR" "{\"action\":\"adjust\",\"itemId\":\"$ITEMID\",\"adjustedQty\":10}"
t "PATCH adjust item dengan alasan" PATCH "/api/procurement" "$JAR" "{\"action\":\"adjust\",\"itemId\":\"$ITEMID\",\"adjustedQty\":10,\"reason\":\"Uji iterasi\"}"
t "PATCH approve rekomendasi" PATCH "/api/procurement" "$JAR" "{\"action\":\"approve\",\"id\":\"$RECID\"}"
t "PATCH approve ulang (idempotent)" PATCH "/api/procurement" "$JAR" "{\"action\":\"approve\",\"id\":\"$RECID\"}"

echo "--- LAPORAN ---"
t "GET /api/reports" GET "/api/reports" "$JAR"
for typ in penjualan permintaan prediksi evaluasi stok rekomendasi; do
  t "GET /api/reports?type=$typ (json meta)" GET "/api/reports?type=$typ&from=2025-01-01&to=2025-01-31" "$JAR"
done
t "GET /api/reports export csv" GET "/api/reports?type=penjualan&format=csv&from=2025-01-01&to=2025-01-31" "$JAR"

echo "--- PENGATURAN & NOTIFIKASI ---"
t "PATCH /api/settings" PATCH "/api/settings" "$JAR" '{"proc.safetyWeeks":1}'
t "GET /api/notifications" GET "/api/notifications" "$JAR"
t "GET /api/activity" GET "/api/activity" "$JAR"

echo "--- PETUGAS RBAC pada aksi admin ---"
t "POST /api/sales (petugas boleh)" POST "/api/sales" "$JAR2" "{\"date\":\"2025-01-22\",\"medicineId\":\"$MEDID\",\"quantity\":1,\"unitPrice\":32000,\"mutation\":\"P\"}"
t "PATCH /api/settings (petugas, expect 403)" PATCH "/api/settings" "$JAR2" '{"proc.safetyWeeks":2}'
t "POST /api/model train (petugas, expect 403)" POST "/api/model" "$JAR2" '{}'
