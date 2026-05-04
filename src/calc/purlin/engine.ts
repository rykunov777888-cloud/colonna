import { calcWind } from "../wind";
import profilesData from "../../data/lstk/profiles.json";
import type {
  LstkProfile,
  LstkProfileType,
  PurlinCandidate,
  PurlinInput,
  PurlinOutput,
  PurlinSectionResult,
  SteelGrade,
} from "./types";

const ALL_PROFILES: Record<SteelGrade, LstkProfile[]> = {
  MP350: profilesData.MP350 as LstkProfile[],
  MP390: profilesData.MP390 as LstkProfile[],
};

/** Cassette filter map: roof structure name -> required purlin h (mm). 0 = no filter. */
const CASSETTE_HEIGHT_MAP: Record<string, number> = {
  "наше 150 мм": 150,
  "наше 200 мм": 200,
  "наше 250 мм": 250,
  "наше 150 мм 1 слой ГВЛ": 150,
  "наше 200 мм 1 слой ГВЛ": 200,
  "наше 250 мм 1 слой ГВЛ": 250,
  "наше 150 мм 2 слоя ГВЛ": 150,
  "наше 200 мм 2 слоя ГВЛ": 200,
  "наше 250 мм 2 слоя ГВЛ": 250,
};

export function getCassetteHeightFilter(roofStructure: string): number {
  return CASSETTE_HEIGHT_MAP[roofStructure] ?? 0;
}

/**
 * Compute snow drift μ₂ and effective design span per Лист1!P81:T83.
 * Returns { mu2, designSpan }.
 */
export function computeSnowDrift(input: PurlinInput): { mu2: number; designSpan_m: number } {
  const { snowDrift, span_m, length_m, drift_dropHeight_m: hDrop, drift_existingSize_m: bExist, Sg_kPa } = input;
  if (snowDrift === "none") {
    return { mu2: 1, designSpan_m: span_m };
  }
  const dim = snowDrift === "along" ? span_m : length_m;
  // mu2_raw = 1 + (1/h) * (0.4*dim + 0.4*existing)
  const mu2_raw = hDrop > 0 ? 1 + (1 / hDrop) * (0.4 * dim + 0.4 * bExist) : 1;
  // Capped: min(2*h/Sg, 4)
  const cap = Math.min(Sg_kPa > 0 ? (2 * hDrop) / Sg_kPa : 4, 4);
  const mu2 = Math.min(mu2_raw, cap);
  // Drift extent (m) — caps:
  const driftExtent = bExist === 0
    ? 2 * hDrop
    : (mu2_raw <= cap
        ? Math.min(2 * hDrop, 16)
        : Math.min(((mu2_raw - 1 + 0.8) / (cap - 1 + 0.8)) * 2 * hDrop, 5 * hDrop, 16));
  // designSpan changes only for "across" — reuse table value (CEILING applied). Approximation:
  const designSpan_m = snowDrift === "across" ? Math.ceil(driftExtent) : span_m;
  return { mu2, designSpan_m };
}

/**
 * Compute combined uniform load q [kPa] for purlin design.
 * q = q_snow + q_wind_roof + q_roof_struct (all positive, with γf and γn).
 *
 * Matches Excel 'ЛСТК МП350'!D1:D3 exactly under SP 20.13330:
 *   q_snow  = 1.4 × 1.1 × 1.13 × μ₂ × Sg × cos(α) × γn
 *   q_wind  = 'Ветер СП'!G35 × γn  (FGH+ zone, downward pressure on roof)
 *   q_roof  = D19 × γn            (roof structure load from dropdown)
 */
export function computeLoads(input: PurlinInput): {
  q_snow_kPa: number;
  q_windRoof_kPa: number;
  q_roof_kPa: number;
  q_total_kPa: number;
  mu2: number;
} {
  const { mu2 } = computeSnowDrift(input);
  const cosAlpha = Math.cos((input.roofSlope_deg * Math.PI) / 180);
  // Snow per SP 20: 1.4 × 1.1 × 1.13 = 1.7402 (γf × shape factor × density factor)
  const q_snow = 1.4 * 1.1 * 1.13 * mu2 * input.Sg_kPa * cosAlpha * input.gamma_n;
  // Wind on roof: re-use existing wind module → verticalRoof_kPa already includes γf=1.4 + ζ + ν
  const wind = calcWind(input.w0_kPa, input.terrainType, input.height_m, input.span_m, input.length_m);
  const q_wind = wind.verticalRoof_kPa * input.gamma_n;
  // Roof structure: load (already kPa) × γn
  const q_roof = input.roofLoad_kPa * input.gamma_n;
  return {
    q_snow_kPa: q_snow,
    q_windRoof_kPa: q_wind,
    q_roof_kPa: q_roof,
    q_total_kPa: q_snow + q_wind + q_roof,
    mu2,
  };
}

/**
 * Evaluate a single (profile, spacing) combination.
 * Returns null if the profile fails the K ≤ 1 check or the height filter.
 */
function evaluateProfile(
  profile: LstkProfile,
  spacing_mm: number,
  q_total_kPa: number,
  input: PurlinInput,
  L_slope_m: number,
): PurlinCandidate | null {
  // Cassette height filter (Лист1!C97)
  if (input.cassetteHeightFilter_mm > 0 && profile.h_mm !== input.cassetteHeightFilter_mm) {
    return null;
  }

  // Effective M_pred: baseline / 0.85 × applied coefficient
  const appliedCoef = input.maxUtilization === "default" ? profile.default_coef : input.maxUtilization;
  const M_pred_eff = (profile.M_pred_baseline_kNm / 0.85) * appliedCoef;

  // Distributed load on purlin (kN/m): q_total × spacing + self-weight × γn
  // self-weight contribution: mass_per_m / 100 ≈ kN/m (matches Excel: mass_kg/m × g≈10 / 1000)
  const s_m = spacing_mm / 1000;
  const w_purlin_kN_per_m = q_total_kPa * s_m + (profile.mass_kg_per_m / 100) * input.gamma_n;

  // Design moment: simply-supported beam M = w·L²/8
  const L = input.framePitch_m;
  const M_design = (w_purlin_kN_per_m * L * L) / 8;

  const K = M_design / M_pred_eff;
  if (K > 1) return null;

  // Number of purlins and mass per frame, matching Excel candidate formulas:
  //   - 2ТПС/2ПС:  countPerHalf = ceil(...) + (1 or 1.5 if sg) + (0 or 0.5 if fence)
  //                 mass_per_frame = countPerHalf × mass × frame_pitch × slope_factor
  //   - Z:        countPerHalf = ceil(...) + (1 or 2 if sg) + (0 or 1 if fence)
  //                 mass_per_frame = countPerHalf × (mass × frame_pitch + 1.72) × slope_factor
  const slopeFactor = input.roofShape === "gable" ? 2 : 1;
  const halfSlope_m = (input.span_m - 0.3) / slopeFactor;
  const baseCount = Math.max(1, Math.ceil(halfSlope_m / s_m));
  const isZ = profile.type === "Z";
  const sgExtra = isZ ? (input.snowGuardPurlin ? 2 : 1) : input.snowGuardPurlin ? 1.5 : 1;
  const fenceExtra = isZ ? (input.fencePurlin ? 1 : 0) : input.fencePurlin ? 0.5 : 0;
  const countPerHalf = baseCount + sgExtra + fenceExtra;
  const nPurlins = countPerHalf * slopeFactor;

  const perPurlinUnit_kg = isZ
    ? profile.mass_kg_per_m * input.framePitch_m + 1.72
    : profile.mass_kg_per_m * input.framePitch_m;
  const massPerFrameStep_kg = countPerHalf * perPurlinUnit_kg * slopeFactor;
  const massPerBuilding_kg = (massPerFrameStep_kg * input.length_m) / input.framePitch_m;

  return {
    profile,
    spacing_mm,
    M_pred_eff_kNm: M_pred_eff,
    M_design_kNm: M_design,
    K,
    nPurlins,
    massPerFrameStep_kg,
    massPerBuilding_kg,
  };
}

/**
 * Iterate over candidate spacings (minStep..maxStep step 5mm) and all profiles.
 * Returns full list of viable candidates (K ≤ 1).
 */
export function enumerateCandidates(
  input: PurlinInput,
  q_total_kPa: number,
  L_slope_m: number,
): PurlinCandidate[] {
  const out: PurlinCandidate[] = [];
  const minS = Math.min(input.minStep_mm, input.maxStep_mm);
  const maxS = Math.max(input.minStep_mm, input.maxStep_mm);
  for (let s = minS; s <= maxS; s += 5) {
    for (const grade of ["MP350", "MP390"] as SteelGrade[]) {
      for (const profile of ALL_PROFILES[grade]) {
        const cand = evaluateProfile(profile, s, q_total_kPa, input, L_slope_m);
        if (cand) out.push(cand);
      }
    }
  }
  return out;
}

/** Group candidates by (grade, type) and pick the lightest in each group. */
function bestPerGroup(candidates: PurlinCandidate[]): PurlinSectionResult[] {
  const grades: SteelGrade[] = ["MP350", "MP390"];
  const types: LstkProfileType[] = ["2TPS", "2PS", "Z"];
  const out: PurlinSectionResult[] = [];
  for (const grade of grades) {
    for (const type of types) {
      const filtered = candidates.filter(
        (c) => c.profile.Ry_MPa === (grade === "MP350" ? 350 : 390) && c.profile.type === type,
      );
      filtered.sort((a, b) => a.massPerBuilding_kg - b.massPerBuilding_kg);
      out.push({ grade, type, best: filtered[0] ?? null });
    }
  }
  return out;
}

export function runPurlinCalculation(input: PurlinInput): PurlinOutput {
  const loads = computeLoads(input);
  const { mu2, designSpan_m } = computeSnowDrift(input);

  const slopeFactor = input.roofShape === "gable" ? 2 : 1;
  const L_slope_m = (input.span_m - 0.3) / slopeFactor;

  const allCandidates = enumerateCandidates(input, loads.q_total_kPa, L_slope_m);

  const sections = bestPerGroup(allCandidates);

  // Top 10 lightest overall
  allCandidates.sort((a, b) => a.massPerBuilding_kg - b.massPerBuilding_kg);
  const top10 = allCandidates.slice(0, 10);

  return {
    q_total_kPa: loads.q_total_kPa,
    q_snow_kPa: loads.q_snow_kPa,
    q_windRoof_kPa: loads.q_windRoof_kPa,
    q_roof_kPa: loads.q_roof_kPa,
    mu2,
    designSpan_m,
    L_slope_m,
    sections,
    top10,
  };
}
