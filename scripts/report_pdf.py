#!/usr/bin/env python3
"""
Generator laporan PDF Apotek Pahala (ReportLab).
Input: JSON {title, subtitle, periode, createdAt, summary: [[label, value]],
             table: {headers, rows}, chart: {type: bar|line, title, data: [[label, value...]], series: [names]},
             insight: [str], footer}
Output: file PDF dengan logo, nomor halaman, dan identitas aplikasi.
"""
import argparse
import json
import math

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.platypus import (BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer,
                                Table, TableStyle, LongTable)
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT

PRIMARY = colors.HexColor("#087F6B")
DARK = colors.HexColor("#0B5F52")
ACCENT = colors.HexColor("#20B58A")
TEXT = colors.HexColor("#18343D")
MUTED = colors.HexColor("#718096")
BG = colors.HexColor("#F5F8FA")


def draw_logo(c, x, y, s=10):
    """Logo apotek: palang hijau + daun (digambar vektor)."""
    c.saveState()
    c.setFillColor(PRIMARY)
    c.roundRect(x, y, s * 2, s * 2, s * 0.45, stroke=0, fill=1)
    c.setFillColor(colors.white)
    w = s * 0.42
    c.roundRect(x + s - w / 2, y + s * 0.22, w, s * 1.56, w / 2, stroke=0, fill=1)
    c.roundRect(x + s * 0.22, y + s - w / 2, s * 1.56, w, w / 2, stroke=0, fill=1)
    c.setFillColor(ACCENT)
    c.circle(x + s * 1.55, y + s * 1.72, s * 0.24, stroke=0, fill=1)
    c.restoreState()


def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(PRIMARY)
    canvas.rect(0, h - 18 * mm, w, 18 * mm, stroke=0, fill=1)
    canvas.setFillColor(DARK)
    canvas.rect(0, h - 20 * mm, w, 2 * mm, stroke=0, fill=1)
    draw_logo(canvas, 14 * mm, h - 15.5 * mm, 5.2)
    canvas.setFillColor(colors.white)
    canvas.setFont("Helvetica-Bold", 13)
    canvas.drawString(26 * mm, h - 10 * mm, "APOTEK PAHALA")
    canvas.setFont("Helvetica", 8.5)
    canvas.drawString(26 * mm, h - 14.5 * mm, "Pharmacy Intelligence - Laporan Analitik Persediaan Obat")
    canvas.setFont("Helvetica", 8.5)
    canvas.drawRightString(w - 14 * mm, h - 10 * mm, doc.title_period or "")
    # footer
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawString(14 * mm, 10 * mm, "Apotek Pahala - Pharmacy Intelligence  |  dibuat: %s" % doc.footer_date)
    canvas.drawRightString(w - 14 * mm, 10 * mm, "Halaman %d" % doc.page)
    canvas.setStrokeColor(colors.HexColor("#E3EBEF"))
    canvas.setLineWidth(0.6)
    canvas.line(14 * mm, 14 * mm, w - 14 * mm, 14 * mm)
    canvas.restoreState()


def build_styles():
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=9.5, leading=13, textColor=TEXT)
    h2 = ParagraphStyle("h2", fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=DARK,
                        spaceBefore=8, spaceAfter=5)
    small = ParagraphStyle("small", fontName="Helvetica", fontSize=8.5, leading=11, textColor=MUTED)
    ins = ParagraphStyle("ins", parent=body, leftIndent=6, spaceAfter=2)
    return body, h2, small, ins


def chart_flowable(chart, width):
    """Grafik sederhana via matplotlib -> PNG -> Image."""
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import tempfile
    from reportlab.platypus import Image

    labels = [str(r[0]) for r in chart["data"]]
    nseries = len(chart.get("series", ["Nilai"]))
    ys = [[r[i + 1] if len(r) > i + 1 and r[i + 1] is not None else 0 for r in chart["data"]] for i in range(nseries)]
    fig_w_in = max(4.0, width / 72.0)  # lebar dokumen (point) -> inci
    fig, ax = plt.subplots(figsize=(fig_w_in, 2.5), dpi=200)
    if chart["type"] == "bar":
        import numpy as np
        x = np.arange(len(labels))
        wgt = 0.8 / nseries
        for i, yv in enumerate(ys):
            ax.bar(x + (i - (nseries - 1) / 2) * wgt, yv, wgt, label=chart["series"][i],
                   color=["#087F6B", "#5BD0A9", "#3985D6", "#F2A93B"][i % 4])
        ax.set_xticks(x)
    else:
        for i, yv in enumerate(ys):
            ax.plot(labels, yv, marker="o", ms=3.5, lw=1.8,
                    label=chart["series"][i], color=["#087F6B", "#5BD0A9", "#3985D6", "#F2A93B"][i % 4])
        if chart.get("dash_last") and nseries:
            pass
    ax.set_title(chart.get("title", ""), fontsize=8.5, color="#18343D")
    ax.tick_params(labelsize=6.5, colors="#718096")
    if chart["type"] == "bar":
        plt.setp(ax.get_xticklabels(), rotation=45 if len(labels) > 12 else 0,
                 ha="right" if len(labels) > 12 else "center", fontsize=6)
    elif len(labels) > 12:
        plt.setp(ax.get_xticklabels(), rotation=45, ha="right", fontsize=6)
    ax.legend(fontsize=6.5, frameon=False)
    ax.spines[["top", "right"]].set_visible(False)
    ax.grid(axis="y", color="#E3EBEF", lw=0.5)
    fig.tight_layout()
    tmp = tempfile.NamedTemporaryFile(suffix=".png", delete=False)
    fig.savefig(tmp.name, bbox_inches="tight")
    plt.close(fig)
    # jaga rasio aspek PNG asli (bbox tight mengubah dimensi), batasi tinggi maksimum
    from PIL import Image as PILImage
    with PILImage.open(tmp.name) as im:
        pw, ph = im.size
    disp_h = min(width * ph / pw, width * 0.40)
    img = Image(tmp.name, width=width, height=disp_h)
    return img


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--json", required=True)
    p.add_argument("--out", required=True)
    args = p.parse_args()
    with open(args.json, "r", encoding="utf-8") as f:
        data = json.load(f)

    body, h2, small, ins = build_styles()
    doc = BaseDocTemplate(args.out, pagesize=A4,
                          leftMargin=14 * mm, rightMargin=14 * mm, topMargin=26 * mm, bottomMargin=18 * mm)
    doc.title_period = data.get("periode", "")
    doc.footer_date = data.get("createdAt", "")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f")
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=header_footer)])
    story = []

    story.append(Paragraph(data.get("title", "Laporan"), ParagraphStyle(
        "title", fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=DARK, spaceAfter=2)))
    if data.get("subtitle"):
        story.append(Paragraph(data["subtitle"], ParagraphStyle("sub", parent=body, fontSize=10, textColor=MUTED, spaceAfter=4)))

    # ringkasan
    if data.get("summary"):
        story.append(Paragraph("Ringkasan Hasil", h2))
        cells = []
        row = []
        for label, value in data["summary"]:
            cell = Table([[Paragraph("<font size=8 color='#718096'>%s</font>" % label, body)],
                          [Paragraph("<font size=11 color='#0B5F52'><b>%s</b></font>" % value, body)]],
                         colWidths=(doc.width - 12) / min(3, len(data["summary"])) - 4)
            cell.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), BG),
                ("BOX", (0, 0), (-1, -1), 0.75, colors.HexColor("#E3EBEF")),
                ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            row.append(cell)
            if len(row) == 3:
                cells.append(row); row = []
        if row:
            cells.append(row)
        wrap = Table(cells, colWidths=[(doc.width - 12) / min(3, len(data["summary"])) + 4] * 3)
        wrap.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                                  ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
        story.append(wrap)

    if data.get("chart"):
        story.append(Paragraph("Grafik", h2))
        story.append(chart_flowable(data["chart"], doc.width))

    if data.get("table"):
        story.append(Paragraph(data["table"].get("title", "Tabel Data"), h2))
        headers = data["table"]["headers"]
        rows = data["table"]["rows"]
        tbl_data = [headers] + [[("" if c is None else str(c)) for c in r] for r in rows]
        # lebar kolom: kolom pertama lebih lebar untuk teks, sisanya rata
        ncol = len(headers)
        if ncol > 2:
            first = doc.width * min(0.34, 0.18 + 0.02 * ncol)
            rest = (doc.width - first) / (ncol - 1)
            col_widths = [first] + [rest] * (ncol - 1)
        else:
            col_widths = [doc.width / ncol] * ncol
        tbl = LongTable(tbl_data, colWidths=col_widths) if rows else None
        if tbl:
            style = [
                ("BACKGROUND", (0, 0), (-1, 0), PRIMARY),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 8),
                ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#E3EBEF")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, BG]),
                ("ALIGN", (1, 1), (-1, -1), "RIGHT"),
                ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
            # angka di header rata kanan kecuali kolom pertama
            tbl.setStyle(TableStyle(style))
            story.append(tbl)
            if data["table"].get("note"):
                story.append(Spacer(1, 3))
                story.append(Paragraph(data["table"]["note"], small))

    if data.get("insight"):
        story.append(Paragraph("Insight & Keterangan", h2))
        for i, txt in enumerate(data["insight"], 1):
            story.append(Paragraph("%d. %s" % (i, txt), ins))

    story.append(Spacer(1, 8))
    story.append(Paragraph("Dokumen ini dihasilkan otomatis oleh Apotek Pahala - Pharmacy Intelligence "
                           "(Capstone Design Project, Universitas Telkom Purwokerto 2026). "
                           "Angka prediksi merupakan estimasi model Random Forest Regression dan perlu dibaca "
                           "bersama metrik kesalahan (MAE, RMSE, MAPE) yang menyertainya.", small))

    doc.build(story)
    print(json.dumps({"ok": True, "out": args.out}))


if __name__ == "__main__":
    main()
