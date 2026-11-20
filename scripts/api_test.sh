#!/usr/bin/env bash
# Uji end-to-end seluruh endpoint API Apotek Pahala (sesi admin + petugas)
BASE="http://localhost:3000"
JAR="/tmp/apotek_admin.jar"
JAR2="/tmp/apotek_petugas.jar"
rm -f "$JAR" "$JAR2"

echo "=== LOGIN admin ==="
curl -s -c "$JAR" -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | head -c 120; echo
echo "=== LOGIN petugas ==="
curl -s -c "$JAR2" -X POST $BASE/api/auth/login -H "Content-Type: application/json" -d '{"username":"petugas","password":"petugas123"}' | head -c 120; echo

test_get() { # $1 label, $2 path, $3 jar
  code=$(curl -s -o /tmp/api_out.json -w "%{http_code}" -b "$3" "$BASE$2" --max-time 30)
  size=$(wc -c < /tmp/api_out.json)
  echo "[$code] $1 (${size}b)"
  if [ "$code" != "200" ]; then head -c 300 /tmp/api_out.json; echo; fi
}

test_post() { # $1 label, $2 path, $3 jar, $4 body
  code=$(curl -s -o /tmp/api_out.json -w "%{http_code}" -b "$3" -X POST "$BASE$2" -H "Content-Type: application/json" -d "$4" --max-time 60)
  size=$(wc -c < /tmp/api_out.json)
  echo "[$code] $1 (${size}b)"
  if [ "$code" -ge "400" ]; then head -c 300 /tmp/api_out.json; echo; fi
}

echo "=== GET endpoints (admin) ==="
test_get "GET /api/dashboard" "/api/dashboard" "$JAR"
test_get "GET /api/medicines" "/api/medicines" "$JAR"
test_get "GET /api/sales?page=1&pageSize=10" "/api/sales?page=1&pageSize=10" "$JAR"
test_get "GET /api/sales search+sort" "/api/sales?search=para&sort=medicine&dir=asc&page=1" "$JAR"
test_get "GET /api/weather" "/api/weather" "$JAR"
test_get "GET /api/inventory" "/api/inventory" "$JAR"
test_get "GET /api/inventory/movements" "/api/inventory/movements" "$JAR"
test_get "GET /api/procurement" "/api/procurement" "$JAR"
test_get "GET /api/notifications" "/api/notifications" "$JAR"
test_get "GET /api/activity" "/api/activity" "$JAR"
test_get "GET /api/model" "/api/model" "$JAR"
test_get "GET /api/settings" "/api/settings" "$JAR"
test_get "GET /api/reports" "/api/reports" "$JAR"
test_get "GET /api/auth/me" "/api/auth/me" "$JAR"

echo "=== GET endpoints (petugas) ==="
test_get "GET /api/dashboard" "/api/dashboard" "$JAR2"

echo "=== RBAC: petugas harus ditolak di endpoint admin ==="
code=$(curl -s -o /tmp/api_out.json -w "%{http_code}" -b "$JAR2" "$BASE/api/settings/users" --max-time 15)
echo "[$code] GET /api/settings/users (petugas) — expect 403"
code=$(curl -s -o /tmp/api_out.json -w "%{http_code}" -b "$JAR2" "$BASE/api/model" --max-time 15)
echo "[$code] GET /api/model (petugas) — cek kebijakan"

echo "=== POST prediksi (obat pertama) ==="
MEDID=$(curl -s -b "$JAR" "$BASE/api/medicines" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['rows'][0]['id'] if isinstance(d,dict) and d.get('rows') else d[0]['id'] if isinstance(d,list) else '')" 2>/dev/null)
echo "medicineId=$MEDID"
test_post "POST /api/predict (4 minggu)" "/api/predict" "$JAR" "{\"medicineId\":\"$MEDID\",\"weeks\":4}"

echo "=== POST/DELETE medicines (CRUD ringan) ==="
test_post "POST /api/medicines (invalid, expect 400)" "/api/medicines" "$JAR" '{"name":"","code":""}'

echo "=== Unauthenticated harus 401 ==="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/dashboard" --max-time 15)
echo "[$code] GET /api/dashboard tanpa sesi — expect 401"
