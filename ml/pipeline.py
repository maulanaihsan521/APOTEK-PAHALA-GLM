#!/usr/bin/env python3
"""
PIPELINE MACHINE LEARNING — Apotek Pahala (Pharmacy Intelligence)
Metodologi laporan Capstone (CRISP-DM):
  1. Load dataset (SQLite)        2. Validasi struktur
  3. Missing values / duplikasi   4. Agregasi mingguan (Senin-Minggu, neto P-R)
  5. Feature engineering          6. Pemisahan kronologis (tanpa kebocoran waktu)
  7. Training                     8. Evaluasi (MAE, RMSE, MAPE)
  9. Penyimpanan model            10. Prediksi (skenario cuaca normal iklim)

Model utama : Random Forest Regression
Pembanding  : Decision Tree Regression, Linear Regression, Naif (lag-1)
"""
import argparse
import json
import math
import os
import sqlite3
import sys
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error
from sklearn.tree import DecisionTreeRegressor

try:
    import joblib
except ImportError:
    joblib = None

BASE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.dirname(BASE)

# ---------------- util ----------------

def week_start(d):
    """Senin sebagai awal pekan (UTC)."""
    x = pd.Timestamp(d).normalize()
    return x - pd.Timedelta(days=int(x.dayofweek))


def iso_week(ts):
    return int(ts.isocalendar().week)


def mape(y_true, y_pred):
    """MAPE hanya pada nilai aktual positif (MAPE tak terdefinisi pada nol)."""
    yt, yp = np.asarray(y_true, dtype=float), np.asarray(y_pred, dtype=float)
    mask = yt > 0
    if mask.sum() == 0:
        return float("nan")
    return float(np.mean(np.abs((yt[mask] - yp[mask]) / yt[mask])) * 100)


def trim_partial_last_week(ser):
    """Buang pekan terakhir bila belum lengkap 7 hari (belum lewat batas data) agar
    evaluasi tidak terdistorsi oleh pekan parsial."""
    if len(ser) == 0:
        return ser
    last_ws = ser.index.max()
    if last_ws + pd.Timedelta(days=6) > pd.Timestamp.now().normalize():
        return ser.iloc[:-1]
    return ser


def load_data(db_path):
    con = sqlite3.connect(db_path)
    sales = pd.read_sql_query(
        'SELECT s."date" AS date_ms, s."quantity" AS qty, m."code" AS code, s."mutation" AS mut '
        'FROM "Sale" s JOIN "Medicine" m ON m."id" = s."medicineId" '
        'WHERE m."isActive" = 1', con)
    weather = pd.read_sql_query(
        'SELECT "date" AS date_ms, "temperature" AS temp, "rainfall" AS rain, "humidity" AS rh '
        'FROM "WeatherData"', con)
    meds = pd.read_sql_query(
        'SELECT "id" AS mid, "code" AS code, "name" AS name, "minStock" AS min_stock, '
        '"buyUnit" AS buy_unit FROM "Medicine" WHERE "isActive" = 1 ORDER BY "name"', con)
    con.close()

    sales["date"] = pd.to_datetime(sales["date_ms"], unit="ms", utc=True).dt.tz_convert("UTC").dt.tz_localize(None)
    weather["date"] = pd.to_datetime(weather["date_ms"], unit="ms", utc=True).dt.tz_localize(None)
    # Validasi: kuantitas retur harus negatif sesuai arsip (mutasi R)
    bad = sales[(sales["mut"] == "R") & (sales["qty"] > 0)]
    sales.loc[bad.index, "qty"] = -sales.loc[bad.index, "qty"]
    return sales, weather, meds


def aggregate_weekly(sales, weather):
    """Agregasi mingguan: permintaan neto = penjualan - |retur|; hujan dijumlah, suhu & RH dirata-rata."""
    s = sales.copy()
    s["ws"] = s["date"].apply(week_start)
    weekly = s.pivot_table(index=["code", "ws"], values="qty", aggfunc="sum").reset_index()
    weekly.rename(columns={"qty": "demand"}, inplace=True)

    w = weather.copy()
    w["ws"] = w["date"].apply(week_start)
    wweekly = w.groupby("ws").agg(temp=("temp", "mean"), rain=("rain", "sum"), rh=("rh", "mean")).reset_index()
    return weekly, wweekly


def build_features(series, wweekly):
    """
    Fitur sesuai metodologi penelitian:
    lag 1-8, lag 52, rata-rata bergulir 4/8/12, deviasi bergulir 4,
    nomor pekan ISO + transformasi sinusoidal musiman, bulan, dan variabel cuaca.
    """
    df = pd.DataFrame({"ws": series.index, "demand": series.values})
    df["woy"] = df["ws"].apply(iso_week)
    for lag in range(1, 9):
        df[f"lag_{lag}"] = df["demand"].shift(lag)
    df["lag_52"] = df["demand"].shift(52)
    df["roll_mean_4"] = df["demand"].shift(1).rolling(4).mean()
    df["roll_mean_8"] = df["demand"].shift(1).rolling(8).mean()
    df["roll_mean_12"] = df["demand"].shift(1).rolling(12).mean()
    df["roll_std_4"] = df["demand"].shift(1).rolling(4).std()
    df["woy_sin"] = np.sin(2 * np.pi * df["woy"] / 52.18)
    df["woy_cos"] = np.cos(2 * np.pi * df["woy"] / 52.18)
    df["month"] = df["ws"].dt.month

    df = df.merge(wweekly, on="ws", how="left")
    # isi cuaca hilang dengan normal iklim per nomor pekan (jaga kelengkapan)
    for col, clim in [("temp", "temp"), ("rain", "rain"), ("rh", "rh")]:
        clim_map = wweekly.groupby(wweekly["ws"].apply(iso_week))[col].mean()
        df[col] = df[col].fillna(df["woy"].map(clim_map))
    df[["temp", "rain", "rh"]] = df[["temp", "rain", "rh"]].fillna(df[["temp", "rain", "rh"]].mean())

    FEATURES = [f"lag_{i}" for i in range(1, 9)] + ["lag_52", "roll_mean_4", "roll_mean_8", "roll_mean_12",
               "roll_std_4", "woy", "woy_sin", "woy_cos", "month", "temp", "rain", "rh"]
    return df, FEATURES


# ---------------- train ----------------

def cmd_train(args):
    db_path = args.db
    out_dir = args.out
    os.makedirs(out_dir, exist_ok=True)
    models_dir = os.path.join(PROJECT, "models")
    os.makedirs(models_dir, exist_ok=True)
    if joblib is None:
        print(json.dumps({"ok": False, "error": "joblib tidak tersedia"}))
        return

    sales, weather, meds = load_data(db_path)
    weekly, wweekly = aggregate_weekly(sales, weather)

    evaluations = []       # baris ModelEvaluation
    test_predictions = []  # baris TestPrediction (model utama RF)
    importances = {}       # fitur terpenting per obat
    meta = {}

    n_est = max(10, int(args.n_estimators))
    max_depth = None if args.max_depth in ("", "None", "0", None) else max(2, int(args.max_depth))
    rs = int(args.random_state)
    test_split = min(0.5, max(0.1, float(args.test_split)))
    use_weather = bool(int(args.use_weather))

    weather_cols = ["temp", "rain", "rh"] if use_weather else []

    for _, med in meds.iterrows():
        code = med["code"]
        ser = weekly[weekly["code"] == code].set_index("ws")["demand"].sort_index()
        ser = ser.reindex(pd.date_range(ser.index.min(), ser.index.max(), freq="W-MON"), fill_value=0)
        ser = trim_partial_last_week(ser)
        n_weeks = len(ser)
        if n_weeks < 30:
            evaluations.append({
                "medicineId": med["mid"], "modelName": "Random Forest Regression",
                "mae": None, "rmse": None, "mape": None,
                "trainWeeks": 0, "testWeeks": 0,
                "note": f"Data tidak mencukupi ({n_weeks} pekan) — model belum dapat dilatih",
            })
            continue

        df, FEATURES = build_features(ser, wweekly)
        model_features = FEATURES if use_weather else [f for f in FEATURES if f not in weather_cols]
        df_model = df.dropna(subset=[c for c in model_features if c not in weather_cols])
        df_model = df_model.dropna(subset=["demand"])

        split_idx = int(len(df_model) * (1 - test_split))
        train, test = df_model.iloc[:split_idx], df_model.iloc[split_idx:]
        X_tr, y_tr = train[model_features].values, train["demand"].values
        X_te, y_te = test[model_features].values, test["demand"].values

        # --- model utama & pembanding ---
        rf = RandomForestRegressor(n_estimators=n_est, max_depth=max_depth, random_state=rs, n_jobs=-1)
        dt = DecisionTreeRegressor(max_depth=max_depth, random_state=rs, min_samples_leaf=8)
        lr = LinearRegression()

        results = []
        for name, model, fitted in [
            ("Random Forest Regression", rf, None),
            ("Decision Tree Regression", dt, None),
            ("Linear Regression", lr, None),
        ]:
            model.fit(X_tr, y_tr)
            pred = model.predict(X_te)
            results.append({
                "medicineId": med["mid"], "modelName": name,
                "mae": round(float(mean_absolute_error(y_te, pred)), 1),
                "rmse": round(float(np.sqrt(np.mean((y_te - pred) ** 2))), 1),
                "mape": round(mape(y_te, pred), 1),
                "trainWeeks": int(len(train)), "testWeeks": int(len(test)),
            })
            if name == "Random Forest Regression":
                rf_test_pred = pred
        # pembanding naif: permintaan pekan sebelumnya
        naive_pred = test["lag_1"].values
        results.append({
            "medicineId": med["mid"], "modelName": "Naif (Pekan Sebelumnya)",
            "mae": round(float(mean_absolute_error(y_te, naive_pred)), 1),
            "rmse": round(float(np.sqrt(np.mean((y_te - naive_pred) ** 2))), 1),
            "mape": round(mape(y_te, naive_pred), 1),
            "trainWeeks": int(len(train)), "testWeeks": int(len(test)),
        })
        evaluations.extend(results)

        # prediksi RF pada data uji (untuk grafik aktual vs prediksi)
        for ws_, a, p in zip(test["ws"], y_te, rf_test_pred):
            test_predictions.append({
                "medicineId": med["mid"], "modelName": "Random Forest Regression",
                "weekStart": pd.Timestamp(ws_).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                "actual": round(float(a), 1), "predicted": round(float(p), 1),
            })

        # --- model akhir untuk prakiraan: dilatih pada SELURUH data ---
        rf_full = RandomForestRegressor(n_estimators=n_est, max_depth=max_depth, random_state=rs, n_jobs=-1)
        rf_full.fit(df_model[model_features].values, df_model["demand"].values)
        importance = {f: round(float(v), 4) for f, v in sorted(zip(model_features, rf_full.feature_importances_), key=lambda x: -x[1])}
        importances[code] = importance

        if joblib is not None:
            joblib.dump({
                "model": rf_full,
                "features": model_features,
                "series": ser,
                "code": code,
                "woy_clim": {col: wweekly.groupby(wweekly["ws"].apply(iso_week))[col].mean().to_dict()
                             for col in ["temp", "rain", "rh"]},
                "params": {"n_estimators": n_est, "max_depth": max_depth, "random_state": rs,
                           "test_split": test_split, "use_weather": use_weather},
            }, os.path.join(models_dir, f"{code}.joblib"))

        meta[code] = {
            "nWeeks": int(n_weeks),
            "firstWeek": str(ser.index.min().date()),
            "lastWeek": str(ser.index.max().date()),
            "rf": {"mae": results[0]["mae"], "rmse": results[0]["rmse"], "mape": results[0]["mape"]},
        }

    now = datetime.now(timezone.utc)
    payload = {
        "ok": True,
        "trainedAt": now.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "evaluations": evaluations,
        "testPredictions": test_predictions,
        "importances": importances,
        "meta": meta,
        "params": {"nEstimators": n_est, "maxDepth": max_depth, "randomState": rs,
                   "testSplit": test_split, "useWeather": use_weather},
    }
    with open(os.path.join(out_dir, "train_result.json"), "w") as f:
        json.dump(payload, f)
    print(json.dumps({
        "ok": True,
        "trainedAt": payload["trainedAt"],
        "nMedicines": len(meta),
        "avgMape": (round(float(np.mean([m["rf"]["mape"] for m in meta.values()])), 1) if meta else None),
        "avgMae": (round(float(np.mean([m["rf"]["mae"] for m in meta.values()])), 1) if meta else None),
    }))


# ---------------- predict ----------------

def cmd_predict(args):
    models_dir = os.path.join(PROJECT, "models")
    out_dir = args.out
    os.makedirs(out_dir, exist_ok=True)
    if joblib is None:
        print(json.dumps({"ok": False, "error": "joblib tidak tersedia"}))
        return
    model_file = os.path.join(models_dir, f"{args.medicine}.joblib")
    if not os.path.exists(model_file):
        print(json.dumps({"ok": False, "error": "Model belum dilatih. Jalankan training model terlebih dahulu.", "code": "NO_MODEL"}))
        return
    art = joblib.load(model_file)
    model, features, ser, woy_clim = art["model"], art["features"], art["series"], art["woy_clim"]

    sales, weather, meds = load_data(args.db)
    weekly, wweekly = aggregate_weekly(sales, weather)
    code = args.medicine
    ser = weekly[weekly["code"] == code].set_index("ws")["demand"].sort_index()
    ser = ser.reindex(pd.date_range(ser.index.min(), ser.index.max(), freq="W-MON"), fill_value=0)
    ser = trim_partial_last_week(ser)
    df, FEATURES = build_features(ser, wweekly)
    use_weather = art["params"]["use_weather"]
    model_features = [f for f in features]  # tersimpan saat training

    horizon = max(1, min(12, int(args.weeks)))
    last_ws = ser.index.max()
    today = pd.Timestamp.now().normalize()
    # prakiraan dimulai pada pekan yang BELUM berjalan (Senin setelah hari ini)
    start_first = last_ws + pd.Timedelta(weeks=1)
    while start_first <= today:
        start_first += pd.Timedelta(weeks=1)
    work_ser = ser.copy()
    future = []
    for step in range(1, horizon + 1):
        ws = start_first + pd.Timedelta(weeks=step - 1)
        woy = iso_week(ws)
        row = {"ws": ws, "demand": 0.0, "woy": woy}
        series_vals = list(work_ser.values)
        for lag in range(1, 9):
            row[f"lag_{lag}"] = series_vals[-lag] if len(series_vals) >= lag else 0.0
        row["lag_52"] = series_vals[-52] if len(series_vals) >= 52 else (np.mean(series_vals) if series_vals else 0.0)
        prev = np.array(series_vals)
        row["roll_mean_4"] = prev[-4:].mean() if len(prev) >= 4 else (prev.mean() if len(prev) else 0.0)
        row["roll_mean_8"] = prev[-8:].mean() if len(prev) >= 8 else (prev.mean() if len(prev) else 0.0)
        row["roll_mean_12"] = prev[-12:].mean() if len(prev) >= 12 else (prev.mean() if len(prev) else 0.0)
        row["roll_std_4"] = prev[-4:].std() if len(prev) >= 4 else 0.0
        row["woy_sin"] = math.sin(2 * math.pi * woy / 52.18)
        row["woy_cos"] = math.cos(2 * math.pi * woy / 52.18)
        row["month"] = ws.month
        # skenario cuaca: normal iklim per nomor pekan (rata-rata historis)
        row["temp"] = float(woy_clim["temp"].get(woy, np.nanmean(list(woy_clim["temp"].values()))))
        row["rain"] = float(woy_clim["rain"].get(woy, np.nanmean(list(woy_clim["rain"].values()))))
        row["rh"] = float(woy_clim["rh"].get(woy, np.nanmean(list(woy_clim["rh"].values()))))

        X = np.array([[row[f] for f in model_features]], dtype=float)
        yhat = float(max(0.0, model.predict(X)[0]))
        future.append({"weekNumber": step, "weekStart": ws.strftime("%Y-%m-%dT%H:%M:%S.000Z"),
                       "predicted": round(yhat, 1),
                       "temp": round(row["temp"], 1), "rain": round(row["rain"], 1), "rh": round(row["rh"], 0)})
        # rekursi: hasil prediksi menjadi lag pekan berikutnya
        work_ser.loc[ws] = yhat

    hist_actual = list(ser.values)[-12:]
    avg_hist = float(np.mean(hist_actual)) if hist_actual else 0.0
    avg_future = float(np.mean([f["predicted"] for f in future]))
    next_week = future[0]["predicted"]
    if avg_future > avg_hist * 1.05:
        trend = "NAIK"
    elif avg_future < avg_hist * 0.95:
        trend = "TURUN"
    else:
        trend = "STABIL"

    # metrik model utama untuk obat ini (dari hasil training terakhir; evaluasi memakai id Prisma)
    mae = rmse = mape_ = None
    tr_file = os.path.join(out_dir, "train_result.json")
    if os.path.exists(tr_file):
        med_row = meds[meds["code"] == code]
        mid = str(med_row.iloc[0]["mid"]) if len(med_row) else None
        with open(tr_file) as f:
            tr = json.load(f)
        if mid:
            for ev in tr["evaluations"]:
                if ev.get("medicineId") == mid and ev["modelName"] == "Random Forest Regression" and ev.get("mae") is not None:
                    mae, rmse, mape_ = ev["mae"], ev["rmse"], ev["mape"]
                    break

    payload = {
        "ok": True,
        "medicineId": args.medicine,
        "periodWeeks": horizon,
        "startDate": future[0]["weekStart"],
        "avgDemand": round(avg_future, 1),
        "nextWeekDemand": round(next_week, 1),
        "trend": trend,
        "mae": mae, "rmse": rmse, "mape": mape_,
        "results": future,
        "scenarioNote": "Nilai cuaca pada horizon prediksi diisi dengan skenario normal iklim per nomor pekan (rata-rata historis). Prediksi merupakan estimasi, bukan angka pasti.",
        "featureNote": "Fitur: lag 1-8 pekan, lag 52 pekan, rata-rata bergulir 4/8/12, deviasi bergulir 4, kalender (pekan ISO, musiman, bulan)" + (", cuaca (suhu, curah hujan, kelembapan)" if use_weather else ""),
        "history12": [
            {"weekStart": idx.strftime("%Y-%m-%dT%H:%M:%S.000Z"), "actual": float(v)}
            for idx, v in zip(ser.index[-12:], ser.values[-12:])
        ],
        "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
    }
    with open(os.path.join(out_dir, f"forecast_{code}_{horizon}.json"), "w") as f:
        json.dump(payload, f)
    print(json.dumps({"ok": True, "avgDemand": payload["avgDemand"], "nextWeekDemand": payload["nextWeekDemand"], "trend": trend}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    pt = sub.add_parser("train")
    pt.add_argument("--db", required=True)
    pt.add_argument("--out", default=os.path.join(PROJECT, "storage", "ml"))
    pt.add_argument("--n-estimators", default="400")
    pt.add_argument("--max-depth", default="")
    pt.add_argument("--random-state", default="42")
    pt.add_argument("--test-split", default="0.2")
    pt.add_argument("--use-weather", default="1")
    pp = sub.add_parser("predict")
    pp.add_argument("--db", required=True)
    pp.add_argument("--out", default=os.path.join(PROJECT, "storage", "ml"))
    pp.add_argument("--medicine", required=True)
    pp.add_argument("--weeks", default="4")
    args = p.parse_args()
    if args.cmd == "train":
        cmd_train(args)
    else:
        cmd_predict(args)
