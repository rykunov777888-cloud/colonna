#!/usr/bin/env python3
"""
Verify our TypeScript engine logic against the actual Excel-computed
baseline values (cells with cached `data_only=True` results).

Excel default:
  span=40, length=80, h=11.5, slope=6°
  frame_pitch=6, fachverk_pitch=6
  spans=one, ties=no, terrain=B, type=фахверковая
  w0=0.6, sg=1.7, gamma_n=1
  roof_load=0.105, wall_load=0.105, addition=15%
  no crane

Excel results (verified):
  N = 63.79 kN
  M = 143.90 kN*m
  wind horizontal (B25) = 1.036 kPa
  wind vertical    (C25) = 0.207 kPa
  snow            (B24) = 2.367 kPa
"""

import math


# ν table (Table 11.6, СП 20.13330) — matches Excel cells AA68:AG74
NU_AXIS_1 = [0.1, 5, 10, 20, 40, 80, 160]
NU_AXIS_2 = [5, 10, 20, 40, 80, 160, 350]
NU_DATA = [
    [0.95, 0.92, 0.88, 0.83, 0.76, 0.67, 0.56],
    [0.89, 0.87, 0.84, 0.80, 0.73, 0.65, 0.54],
    [0.85, 0.84, 0.81, 0.77, 0.71, 0.64, 0.53],
    [0.80, 0.78, 0.76, 0.73, 0.68, 0.61, 0.51],
    [0.72, 0.72, 0.70, 0.67, 0.63, 0.57, 0.48],
    [0.63, 0.63, 0.61, 0.59, 0.56, 0.51, 0.44],
    [0.53, 0.53, 0.52, 0.50, 0.47, 0.44, 0.38],
]


def interp_idx(arr, val):
    if val <= arr[0]:
        return (0, 0, 0.0)
    for i in range(len(arr) - 1, -1, -1):
        if arr[i] <= val:
            if i == len(arr) - 1:
                return (i, i, 0.0)
            return (i, i + 1, (val - arr[i]) / (arr[i + 1] - arr[i]))
    return (0, 0, 0.0)


def get_nu(axis1, axis2):
    a1_lo, a1_hi, a1_f = interp_idx(NU_AXIS_1, axis1)
    a2_lo, a2_hi, a2_f = interp_idx(NU_AXIS_2, axis2)
    v00 = NU_DATA[a1_lo][a2_lo]
    v01 = NU_DATA[a1_lo][a2_hi]
    v10 = NU_DATA[a1_hi][a2_lo]
    v11 = NU_DATA[a1_hi][a2_hi]
    L = v00 + a1_f * (v10 - v00)
    M = v01 + a1_f * (v11 - v01)
    lo, hi = NU_AXIS_2[a2_lo], NU_AXIS_2[a2_hi]
    if hi == lo:
        return L
    return ((hi - axis2) / (hi - lo)) * (M - L) + L


# k(ze) and ζ(ze) tables, СП 20.13330.2016
KZE = {
    "B": [(5, 0.5), (10, 0.65), (20, 0.85), (40, 1.10)],
    "A": [(5, 0.75), (10, 1.0), (20, 1.25), (40, 1.5)],
    "C": [(5, 0.4), (10, 0.4), (20, 0.55), (40, 0.8)],
}
ZETA = {
    "B": [(5, 1.22), (10, 1.06), (20, 0.92), (40, 0.80)],
    "A": [(5, 0.85), (10, 0.76), (20, 0.69), (40, 0.62)],
    "C": [(5, 1.78), (10, 1.78), (20, 1.50), (40, 1.26)],
}


def interp(table, z):
    z = max(z, 5)
    if z >= table[-1][0]:
        return table[-1][1]
    for i in range(len(table) - 1):
        if table[i][0] <= z <= table[i + 1][0]:
            f = (z - table[i][0]) / (table[i + 1][0] - table[i][0])
            return table[i][1] + f * (table[i + 1][1] - table[i][1])
    return table[0][1]


def calc_wind(w0, terrain, h, span, length):
    kze = interp(KZE[terrain], h)
    zeta = interp(ZETA[terrain], h)
    gamma_f = 1.4

    nu_long_b = get_nu(0.4 * span, h)
    nu_short_b = get_nu(span, h)

    def zone_total(c, nu):
        mean = abs(w0 * kze * c * gamma_f)
        pulse = mean * zeta * nu
        return mean + pulse

    long_b = zone_total(-0.8, nu_long_b)
    short_b = zone_total(-0.8, nu_short_b)
    fgh_plus = zone_total(0.2, nu_long_b)

    return {
        "kze": kze,
        "zeta": zeta,
        "nu_long_b": nu_long_b,
        "nu_short_b": nu_short_b,
        "long_b": long_b,
        "short_b": short_b,
        "fgh_plus": fgh_plus,
        "horizontal": max(long_b, short_b) + fgh_plus,
        "vertical": fgh_plus,
    }


def moment_coeff(col_type, ties, spans):
    if col_type == "fachwerk":
        return 0.35
    if col_type == "edge":
        if ties:
            return 0.3 if spans == "multi" else 0.55
        return 0.9 if spans == "multi" else 1.0
    if col_type == "middle":
        if ties:
            return 0.1 if spans == "multi" else 0.55
        return 0.6 if spans == "multi" else 1.0
    return 0.35


def tributary_area(col_type, span, frame_pitch, fachverk_pitch):
    if col_type == "edge":
        return (span / 2) * frame_pitch
    if col_type == "middle":
        return span * frame_pitch
    return (fachverk_pitch * frame_pitch) / 2


def wall_area(col_type, h, frame_pitch, fachverk_pitch):
    if col_type == "fachwerk":
        return h * fachverk_pitch
    return h * frame_pitch


def calc(p):
    snow = 1.4 * p["sg"] * math.cos(math.radians(p["slope"])) * p["gamma_n"]
    w = calc_wind(p["w0"], p["terrain"], p["h"], p["span"], p["length"])
    wind_h = w["horizontal"] * p["gamma_n"]
    wind_v = w["vertical"] * p["gamma_n"]
    roof = p["roof_load"] * p["gamma_n"]
    wall = p["wall_load"] * p["gamma_n"]

    A_v = tributary_area(p["col_type"], p["span"], p["frame_pitch"], p["fachverk_pitch"])
    A_w = wall_area(p["col_type"], p["h"], p["frame_pitch"], p["fachverk_pitch"])

    N = ((snow + wind_v + roof) * A_v + wall * A_w) * (1 + p["addition"] / 100)

    pitch = p["fachverk_pitch"] if p["col_type"] == "fachwerk" else p["frame_pitch"]
    M_base = wind_h * pitch * p["h"] ** 2 / 2
    coeff = moment_coeff(p["col_type"], p["ties"], p["spans"])
    M = M_base * coeff
    return {
        "snow": snow,
        "wind_h": wind_h,
        "wind_v": wind_v,
        "wind_detail": w,
        "M_base": M_base,
        "coeff": coeff,
        "N": N,
        "M": M,
    }


# Excel default:
defaults = {
    "span": 40, "length": 80, "h": 11.5, "slope": 6,
    "frame_pitch": 6, "fachverk_pitch": 6,
    "spans": "one", "ties": False, "terrain": "B",
    "col_type": "fachwerk",
    "w0": 0.6, "sg": 1.7, "gamma_n": 1.0,
    "roof_load": 0.105, "wall_load": 0.105, "addition": 15,
}

r = calc(defaults)
print("Excel default scenario verification:")
print(f"  Snow расч (target=2.367):     {r['snow']:.4f}")
print(f"  Wind horizontal (target=1.036): {r['wind_h']:.4f}")
print(f"    long_B  (target=0.829)     : {r['wind_detail']['long_b']:.4f}")
print(f"    short_B (target=0.7907)    : {r['wind_detail']['short_b']:.4f}")
print(f"    FGH+    (target=0.2072)    : {r['wind_detail']['fgh_plus']:.4f}")
print(f"    nu long_B (target=0.7836)  : {r['wind_detail']['nu_long_b']:.4f}")
print(f"    nu short_B (target=0.7030) : {r['wind_detail']['nu_short_b']:.4f}")
print(f"    kze (target=0.68)          : {r['wind_detail']['kze']:.4f}")
print(f"    zeta (target=1.039)        : {r['wind_detail']['zeta']:.4f}")
print(f"  Wind vertical (target=0.207):  {r['wind_v']:.4f}")
print(f"  M_base (target=411.13):        {r['M_base']:.2f}")
print(f"  Coeff  (target=0.35):          {r['coeff']:.4f}")
print()
print(f"  N (target=63.79 kN):           {r['N']:.4f} kN")
print(f"  M (target=143.90 kN·m):        {r['M']:.4f} kN*m")
