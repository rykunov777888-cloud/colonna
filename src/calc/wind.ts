import type { TerrainType } from "./types";

const K_ZE_TABLE: Record<TerrainType, [number, number][]> = {
  A: [
    [5, 0.75], [10, 1.0], [20, 1.25], [40, 1.5], [60, 1.7],
    [80, 1.85], [100, 2.0], [150, 2.25], [200, 2.45], [250, 2.65],
    [300, 2.75], [350, 2.75],
  ],
  B: [
    [5, 0.5], [10, 0.65], [20, 0.85], [40, 1.1], [60, 1.3],
    [80, 1.45], [100, 1.6], [150, 1.9], [200, 2.1], [250, 2.3],
    [300, 2.5], [350, 2.5],
  ],
  C: [
    [5, 0.4], [10, 0.4], [20, 0.55], [40, 0.8], [60, 1.0],
    [80, 1.15], [100, 1.25], [150, 1.55], [200, 1.8], [250, 2.0],
    [300, 2.2], [350, 2.2],
  ],
};

const ZETA_TABLE: Record<TerrainType, [number, number][]> = {
  A: [
    [5, 0.85], [10, 0.76], [20, 0.69], [40, 0.62], [60, 0.58],
    [80, 0.56], [100, 0.54], [150, 0.51], [200, 0.49], [250, 0.47],
    [300, 0.46], [350, 0.46],
  ],
  B: [
    [5, 1.22], [10, 1.06], [20, 0.92], [40, 0.8], [60, 0.74],
    [80, 0.7], [100, 0.67], [150, 0.62], [200, 0.58], [250, 0.56],
    [300, 0.54], [350, 0.54],
  ],
  C: [
    [5, 1.78], [10, 1.78], [20, 1.5], [40, 1.26], [60, 1.14],
    [80, 1.06], [100, 1.0], [150, 0.9], [200, 0.84], [250, 0.8],
    [300, 0.76], [350, 0.76],
  ],
};

function interpolateTable(table: [number, number][], z: number): number {
  if (z <= table[0][0]) return table[0][1];
  if (z >= table[table.length - 1][0]) return table[table.length - 1][1];
  for (let i = 0; i < table.length - 1; i++) {
    if (z >= table[i][0] && z <= table[i + 1][0]) {
      const frac = (z - table[i][0]) / (table[i + 1][0] - table[i][0]);
      return table[i][1] + frac * (table[i + 1][1] - table[i][1]);
    }
  }
  return table[table.length - 1][1];
}

export function getKze(terrain: TerrainType, z_m: number): number {
  return interpolateTable(K_ZE_TABLE[terrain], Math.max(z_m, 5));
}

export function getZeta(terrain: TerrainType, z_m: number): number {
  return interpolateTable(ZETA_TABLE[terrain], Math.max(z_m, 5));
}

/**
 * Table 11.6 of СП 20.13330.2016 — spatial correlation coefficient ν(ρ, χ).
 *
 * Table values are taken directly from the reference Excel calculator's
 * "Ветер по СП" sheet (cells AA68:AG74).
 *
 * Axis 1 (rows): ρ — first dimension of the load reference area
 * Axis 2 (cols): χ — second dimension of the load reference area
 */
const NU_AXIS_1 = [0.1, 5, 10, 20, 40, 80, 160];
const NU_AXIS_2 = [5, 10, 20, 40, 80, 160, 350];
const NU_DATA: number[][] = [
  [0.95, 0.92, 0.88, 0.83, 0.76, 0.67, 0.56],
  [0.89, 0.87, 0.84, 0.80, 0.73, 0.65, 0.54],
  [0.85, 0.84, 0.81, 0.77, 0.71, 0.64, 0.53],
  [0.80, 0.78, 0.76, 0.73, 0.68, 0.61, 0.51],
  [0.72, 0.72, 0.70, 0.67, 0.63, 0.57, 0.48],
  [0.63, 0.63, 0.61, 0.59, 0.56, 0.51, 0.44],
  [0.53, 0.53, 0.52, 0.50, 0.47, 0.44, 0.38],
];

/**
 * Locate the interpolation interval for `val` within `arr`.
 * Reproduces Excel's `MATCH(val, arr, 1)` semantics: returns the
 * largest index whose value is ≤ `val`, plus the next one as the
 * upper bound (or last/last when `val` is at or beyond the end).
 */
function interpIdx(arr: number[], val: number): { lo: number; hi: number; frac: number } {
  if (val <= arr[0]) return { lo: 0, hi: 0, frac: 0 };
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] <= val) {
      if (i === arr.length - 1) return { lo: i, hi: i, frac: 0 };
      return { lo: i, hi: i + 1, frac: (val - arr[i]) / (arr[i + 1] - arr[i]) };
    }
  }
  return { lo: 0, hi: 0, frac: 0 };
}

/**
 * Bilinear interpolation reproducing the source Excel calculator's
 * approach (rows interpolated linearly by ρ; columns interpolated
 * along χ with the inverse-direction weighting used in the Excel
 * formula for cells Q16/Q17/Q18 etc.).
 */
export function getNu(axis1: number, axis2: number): number {
  const a1 = interpIdx(NU_AXIS_1, axis1);
  const a2 = interpIdx(NU_AXIS_2, axis2);

  const v00 = NU_DATA[a1.lo][a2.lo];
  const v01 = NU_DATA[a1.lo][a2.hi];
  const v10 = NU_DATA[a1.hi][a2.lo];
  const v11 = NU_DATA[a1.hi][a2.hi];

  // L: interpolate along ρ at χ = axis2_lower
  const L = v00 + a1.frac * (v10 - v00);
  // M: interpolate along ρ at χ = axis2_upper
  const M = v01 + a1.frac * (v11 - v01);

  // χ direction interpolation as written in the source Excel:
  // Q = (axis2_upper - target) / (axis2_upper - axis2_lower) * (M - L) + L
  const lo = NU_AXIS_2[a2.lo];
  const hi = NU_AXIS_2[a2.hi];
  if (hi === lo) return L;
  return ((hi - axis2) / (hi - lo)) * (M - L) + L;
}

function zoneTotal(
  w0: number,
  kze: number,
  cAero: number,
  gamma_f: number,
  zeta: number,
  nu: number,
): number {
  const mean = Math.abs(w0 * kze * cAero * gamma_f);
  const pulse = mean * zeta * nu;
  return mean + pulse;
}

export interface WindResult {
  /** B25: total horizontal for moment (max of long/short B-zone + FGH+) */
  horizontalPressure_kPa: number;
  /** C25: vertical roof component (FGH+ only) */
  verticalRoof_kPa: number;
}

/**
 * Wind calculation per СП 20.13330.2016 matching the source Excel.
 *
 * B25 (горизонт. для момента) = max(long_B, short_B) + FGH+
 * C25 (вертикальная)          = FGH+
 *
 * The ν assignments below follow the exact wiring in the Excel
 * helper rows (Q16/Q17/Q18 for long side, Q19/Q20/Q21 for short side).
 *
 *   Long-side wind (wind perpendicular to length):
 *     - zone B    → ν = ν(0.4·span, h)         [Q17 / L27]
 *     - FGH+      → ν = ν(0.4·span, h)         [Q17 / L27]
 *   Short-side wind (wind perpendicular to span):
 *     - zone B    → ν = ν(span, h)             [Q20 / L40]
 */
export function calcWind(
  w0: number,
  terrain: TerrainType,
  height_m: number,
  span_m: number,
  length_m: number,
): WindResult {
  const h = Math.max(height_m, 5);
  const kze = getKze(terrain, h);
  const zeta = getZeta(terrain, h);
  const gamma_f = 1.4;

  const nuLongB = getNu(0.4 * span_m, h);
  const nuShortB = getNu(span_m, h);
  const nuFghPlus = nuLongB;

  const longB = zoneTotal(w0, kze, -0.8, gamma_f, zeta, nuLongB);
  const shortB = zoneTotal(w0, kze, -0.8, gamma_f, zeta, nuShortB);
  const fghPlus = zoneTotal(w0, kze, 0.2, gamma_f, zeta, nuFghPlus);

  return {
    horizontalPressure_kPa: Math.max(longB, shortB) + fghPlus,
    verticalRoof_kPa: fghPlus,
  };
}
