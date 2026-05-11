#!/usr/bin/env python3
"""
Excel oracle for the truss calculator.

Strategy:
  1. Load the source xlsx (~/attachments/.../v1.0+1+1.xlsx).
  2. Override input cells (Лист1!B2..B35, Единичные эпюры!B11) with
     literal values; replace formula-driven w0/Sg with hard-coded
     numbers to bypass external lookups.
  3. Save to a temp dir, recalc via LibreOffice headless.
  4. Re-read with data_only=True and pull selected profile names,
     masses, K-coefficients, total mass.
"""
import os
import sys
import json
import subprocess
import tempfile
import openpyxl

SRC_XLSX_DEFAULT = (
    "/home/ubuntu/attachments/7b567734-05f5-4029-811e-5ce21e2691ff/"
    "++++v1.0+1+1.xlsx"
)
SRC_XLSX = os.environ.get("TRUSS_XLSX", "/tmp/new_calc.xlsx")
if not os.path.exists(SRC_XLSX):
    SRC_XLSX = SRC_XLSX_DEFAULT


def patch_and_recalc(out_dir, params, idx):
    wb = openpyxl.load_workbook(SRC_XLSX, data_only=False)
    ws1 = wb["Лист1"]
    we = wb["Единичные эпюры"]

    # Inputs (Лист1)
    ws1["B3"] = params["gamma_n"]
    ws1["B6"] = params["span"]
    ws1["B7"] = params["length"]
    ws1["B8"] = params["height"]
    ws1["B9"] = params["slope"]
    ws1["B10"] = params["frame_pitch"]
    ws1["B12"] = params["purlin_pitch_mm"]
    ws1["B16"] = params["terrain"]  # А/В/С (Cyrillic)
    # Override formula-driven w0/sg with literal numbers — bypass external lookups
    ws1["B17"] = params["w0"]
    ws1["B18"] = params["sg"]
    ws1["B19"] = params["roof_struct"]
    ws1["B22"] = params["t_VP"]
    ws1["B23"] = params["t_NP"]
    ws1["B24"] = params["t_ORb"]
    ws1["B25"] = params["t_OR"]
    ws1["B26"] = params["t_RR"]
    ws1["B29"] = params["w_VP_max"]
    ws1["B30"] = params["w_NP_max"]
    ws1["B33"] = params["w_ORb_min"]
    ws1["B34"] = params["w_OR_min"]
    ws1["B35"] = params["w_RR_min"]

    # Load addition
    we["B11"] = params["addition"]

    wb.properties.calcMode = "auto"

    in_dir = os.path.join(out_dir, f"in_{idx}")
    out_sub = os.path.join(out_dir, f"out_{idx}")
    os.makedirs(in_dir, exist_ok=True)
    os.makedirs(out_sub, exist_ok=True)
    src_copy = os.path.join(in_dir, f"sc_{idx}.xlsx")
    wb.save(src_copy)

    res = subprocess.run(
        [
            "libreoffice", "--headless", "--calc",
            "--convert-to", "xlsx",
            "--outdir", out_sub,
            src_copy,
        ],
        capture_output=True, text=True, timeout=180,
    )
    if res.returncode != 0:
        raise RuntimeError(f"libreoffice failed: {res.stderr}")

    out_file = os.path.join(out_sub, f"sc_{idx}.xlsx")
    wb2 = openpyxl.load_workbook(out_file, data_only=True)
    ws1b = wb2["Лист1"]
    web = wb2["Единичные эпюры"]

    return {
        "loads": {
            "snow": web["D7"].value,  # not exposed directly; we use single-section unit values
            # Actually loads aren't directly published; we'll just take selected output.
        },
        "selected": {
            "VP":  {"name": ws1b["B41"].value, "mass": ws1b["C41"].value, "K": ws1b["D41"].value},
            "NP":  {"name": ws1b["B45"].value, "mass": ws1b["C45"].value, "K": ws1b["D45"].value},
            "ORb": {"name": ws1b["B49"].value, "mass": ws1b["C49"].value, "K": ws1b["D49"].value},
            "OR":  {"name": ws1b["B53"].value, "mass": ws1b["C53"].value, "K": ws1b["D53"].value},
            "RR":  {"name": ws1b["B57"].value, "mass": ws1b["C57"].value, "K": ws1b["D57"].value},
        },
        "totalMass": ws1b["B59"].value,
        "perM2": ws1b["B60"].value,
    }


def base_input():
    return dict(
        gamma_n=1.0,
        span=24, length=30, height=12, slope=6,
        frame_pitch=6, purlin_pitch_mm=0,
        terrain="В",
        w0=0.3, sg=1.2,
        roof_struct="наше 250 мм",
        t_VP=4, t_NP=4, t_ORb=4, t_OR=4, t_RR=3,
        w_VP_max=500, w_NP_max=500,
        w_ORb_min=80, w_OR_min=80, w_RR_min=60,
        addition=15,
    )


def variant(**overrides):
    p = base_input()
    p.update(overrides)
    return p


SCENARIOS = [
    ("S1: дефолт (Челябинск, span=24, h=12)", base_input()),
    ("S2: span=18", variant(span=18)),
    ("S3: span=30", variant(span=30)),
    ("S4: высота h=18", variant(height=18)),
    ("S5: тип местности А", variant(terrain="А")),
    ("S6: жёстче кровля (С-П 250 мм)", variant(roof_struct="С-П 250 мм")),
    ("S7: больший снег (sg=2.4)", variant(sg=2.4)),
    ("S8: больший ветер (w0=0.6)", variant(w0=0.6)),
]


def main():
    if len(sys.argv) > 1:
        only_idx = int(sys.argv[1])
    else:
        only_idx = None
    out_dir = tempfile.mkdtemp(prefix="trussoracle_")
    print(f"[oracle] working dir: {out_dir}", file=sys.stderr)
    print(f"[oracle] using xlsx: {SRC_XLSX}", file=sys.stderr)

    result = []
    for idx, (name, params) in enumerate(SCENARIOS):
        if only_idx is not None and idx != only_idx:
            continue
        print(f"[oracle] {idx}: {name}", file=sys.stderr)
        try:
            r = patch_and_recalc(out_dir, params, idx)
            result.append({"idx": idx, "name": name, "params": params, "excel": r})
        except Exception as e:
            result.append({"idx": idx, "name": name, "params": params, "error": str(e)})

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
