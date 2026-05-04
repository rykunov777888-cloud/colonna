/** Light-gauge steel framing (ЛСТК) purlin types. */

export type LstkProfileType = "2TPS" | "2PS" | "Z";
export type SteelGrade = "MP350" | "MP390";

export interface LstkProfile {
  /** Original Russian name, e.g. "2ТПС 145х45х1,5" */
  name: string;
  type: LstkProfileType;
  h_mm: number;
  /** Width — present for 2ТПС/2ПС, null for Z */
  b_mm: number | null;
  t_mm: number;
  /** Baseline (working coefficient = 0.85) bending capacity, kN·m */
  M_pred_baseline_kNm: number;
  /** Default working coefficient for "по умолчанию" mode (0.85 / 0.87 / 0.9 by thickness) */
  default_coef: number;
  /** Linear mass, kg/m */
  mass_kg_per_m: number;
  Ry_MPa: number;
}

export type SnowDriftMode = "none" | "along" | "across";

export type RoofShape = "gable" | "monoslope";

export interface PurlinInput {
  /** γn — coefficient of responsibility */
  gamma_n: number;
  /** Roof shape: gable (двускатная) splits slope length /2; monoslope keeps full */
  roofShape: RoofShape;

  /** Building geometry */
  span_m: number;
  length_m: number;
  height_m: number;
  /** Roof slope, degrees (cosine factor for snow) */
  roofSlope_deg: number;
  /** Frame pitch (m) — equals purlin span */
  framePitch_m: number;

  /** Wind */
  terrainType: "A" | "B" | "C";
  w0_kPa: number;
  /** Snow ground load, kN/m² */
  Sg_kPa: number;

  /** Roof structure (kPa) — choose from dropdown of constructions */
  roofStructure: string;
  roofLoad_kPa: number;

  /** Snow drift settings */
  snowDrift: SnowDriftMode;
  /** Height drop for drift (m), used when drift ≠ none */
  drift_dropHeight_m: number;
  /** Existing building dimension (m) */
  drift_existingSize_m: number;

  /** Purlin step constraints (mm) */
  maxStep_mm: number;
  minStep_mm: number;

  /** Optional extra purlins */
  snowGuardPurlin: boolean;
  fencePurlin: boolean;

  /** Maximum utilization: either "default" (per-thickness from Excel) or fixed fraction (e.g. 0.8) */
  maxUtilization: "default" | number;

  /** Sandwich panel cassette height filter (mm), 0 = no filter */
  cassetteHeightFilter_mm: number;
}

export interface PurlinCandidate {
  profile: LstkProfile;
  spacing_mm: number;
  /** Effective M_pred at applied coefficient, kN·m */
  M_pred_eff_kNm: number;
  /** Design moment per purlin, kN·m */
  M_design_kNm: number;
  /** Utilization ratio = M_design / M_pred_eff */
  K: number;
  /** Number of purlins per slope */
  nPurlins: number;
  /** Mass for one frame step, kg */
  massPerFrameStep_kg: number;
  /** Mass for full building, kg */
  massPerBuilding_kg: number;
}

export interface PurlinSectionResult {
  /** Best candidate for given grade × type combination */
  best: PurlinCandidate | null;
  grade: SteelGrade;
  type: LstkProfileType;
}

export interface PurlinOutput {
  /** Combined load q [kPa] = q_snow + q_wind_roof + q_roof_struct */
  q_total_kPa: number;
  q_snow_kPa: number;
  q_windRoof_kPa: number;
  q_roof_kPa: number;

  /** Effective μ₂ used in snow */
  mu2: number;

  /** Effective design span (m) — for snow drift it may shift */
  designSpan_m: number;

  /** Slope length (m) */
  L_slope_m: number;

  /** Best candidate per (grade, type), 6 cells: 2 grades × 3 types */
  sections: PurlinSectionResult[];

  /** Top 10 overall (lightest) candidates */
  top10: PurlinCandidate[];
}
