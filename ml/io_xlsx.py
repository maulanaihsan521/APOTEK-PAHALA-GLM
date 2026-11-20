#!/usr/bin/env python3
"""
Utilitas impor/ekspor Excel (openpyxl) — dipanggil dari API route.
Mode:
  read : baca file xlsx -> JSON baris
  write: JSON (headers + rows) -> file xlsx
"""
import argparse
import json
import sys


def cmd_read(args):
    from openpyxl import load_workbook
    wb = load_workbook(args.file, data_only=True, read_only=True)
    ws = wb.active
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append(["" if c is None else c for c in row])
    wb.close()
    print(json.dumps({"ok": True, "rows": rows}))


def cmd_write(args):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    with open(args.json, "r", encoding="utf-8") as f:
        data = json.load(f)
    wb = Workbook()
    ws = wb.active
    ws.title = data.get("sheet", "Data")[:31]
    headers = data["headers"]
    rows = data["rows"]
    ws.append(headers)
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="087F6B")
        c.alignment = Alignment(horizontal="center")
    for r in rows:
        ws.append(r)
    # kolom otomatis
    for i, h in enumerate(headers, start=1):
        width = max(len(str(h)) + 2, *(len(str(r[i - 1])) + 2 for r in rows)) if rows else len(str(h)) + 2
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = min(40, max(10, width))
    wb.save(args.out)
    print(json.dumps({"ok": True, "out": args.out, "nRows": len(rows)}))


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    pr = sub.add_parser("read")
    pr.add_argument("--file", required=True)
    pw = sub.add_parser("write")
    pw.add_argument("--json", required=True)
    pw.add_argument("--out", required=True)
    pw.add_argument("--sheet", default="Data")
    args = p.parse_args()
    if args.cmd == "read":
        cmd_read(args)
    else:
        cmd_write(args)
