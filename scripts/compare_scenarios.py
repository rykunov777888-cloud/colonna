#!/usr/bin/env python3
"""
10-scenario comparison: Excel (ground truth, recalculated via
LibreOffice) vs the TypeScript engine logic (Python translation).

Run `excel_oracle.py` first to produce the Excel ground-truth file.
"""
import json
import os
import sys
import subprocess

HERE = os.path.dirname(__file__)
sys.path.insert(0, HERE)
from verify_baseline import calc  # noqa: E402

ORACLE_JSON = "/tmp/oracle_results.json"

if not os.path.exists(ORACLE_JSON) or "--refresh" in sys.argv:
    print("Generating Excel ground truth via LibreOffice…")
    subprocess.check_call([sys.executable, os.path.join(HERE, "excel_oracle.py"), ORACLE_JSON])

with open(ORACLE_JSON) as f:
    oracle = json.load(f)

# Map Russian column-type/spans/ties from oracle to engine vocabulary
COL_TYPE_MAP = {"фахверковая": "fachwerk", "крайняя": "edge", "средняя": "middle"}
SPANS_MAP = {"один": "one", "более одного": "multi"}
TERRAIN_MAP = {"А": "A", "В": "B", "С": "C"}

print()
print("=" * 110)
print(f"{'#':>2} {'Сценарий':<46} "
      f"{'N(Excel)':>10} {'N(App)':>10} {'ΔN%':>6}  "
      f"{'M(Excel)':>10} {'M(App)':>10} {'ΔM%':>6}")
print("=" * 110)

all_ok = True

for i, sc in enumerate(oracle, 1):
    p = sc["params"]
    # Engine inputs
    eng_params = {
        "span": p["span"], "length": p["length"], "h": p["h"],
        "slope": p["slope"], "frame_pitch": p["frame_pitch"],
        "fachverk_pitch": p["fachverk_pitch"],
        "spans": SPANS_MAP[p["spans"]], "ties": p["ties"],
        "terrain": TERRAIN_MAP[p["terrain"]],
        "col_type": COL_TYPE_MAP[p["col_type_ru"]],
        "w0": p["w0"], "sg": p["sg"], "gamma_n": p["gamma_n"],
        "addition": p["addition"],
        "roof_load": 0.105, "wall_load": 0.105,
    }
    e = sc["result"]
    a = calc(eng_params)

    dN = (a["N"] - e["N"]) / e["N"] * 100 if e["N"] else 0
    dM = (a["M"] - e["M"]) / e["M"] * 100 if e["M"] else 0

    if abs(dN) > 0.5 or abs(dM) > 0.5:
        all_ok = False

    print(f"{i:>2} {sc['label']:<46} "
          f"{e['N']:>10.2f} {a['N']:>10.2f} {dN:>5.2f}% "
          f"{e['M']:>10.2f} {a['M']:>10.2f} {dM:>5.2f}%")

print("=" * 110)
print()
if all_ok:
    print("PASS: all 10 scenarios match Excel within 0.5% on N and M.")
else:
    print("FAIL: some scenarios deviate from Excel by more than 0.5%.")
    sys.exit(1)
