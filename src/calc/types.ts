export type ColumnType = "edge" | "middle" | "fachwerk";
export type RoofType = "gable" | "single_slope";
export type TerrainType = "A" | "B" | "C";
export type SteelGrade = "С255Б" | "С355Б" | "С245" | "С345";
export type SpanCount = "single" | "multi";

export interface ProfileData {
  name: string;
  category: "beam_normal" | "beam_wide" | "beam_column" | "square_tube" | "rect_tube";
  h_mm: number | null;
  b_mm: number | null;
  s_mm: number | null;
  t_mm: number | null;
  R_mm: number | null;
  A_cm2: number;
  mass_kg_per_m: number;
  Ix_cm4: number;
  Wx_cm3: number;
  Sx_cm3: number | null;
  ix_cm: number;
  Iy_cm4: number;
  Wy_cm3: number;
  iy_cm: number;
}

export interface CraneInput {
  enabled: boolean;
  type: "overhead" | "suspended";
  capacity_t: number;
  span_m: number;
  count: "one" | "two";
  singleSpan: boolean;
  railLevel_m: number;
  wheelLoad_kN: number;
  trolleyMass_t: number;
  base_m: number;
  clearance_m: number;
}

export interface SteelPrices {
  "С255Б": number;
  "С355Б": number;
  "С245": number;
  "С345": number;
}

export interface CalculationInput {
  height_m: number;
  span_m: number;
  length_m: number;
  framePitch_m: number;
  fachverkPitch_m: number;
  roofSlope_deg: number;
  roofType: RoofType;
  spanCount: SpanCount;
  perimeterTies: boolean;
  columnType: ColumnType;
  responsibilityCoeff: number;
  terrainType: TerrainType;
  w0_kPa: number;
  Sg_kPa: number;
  roofLoad_kPa: number;
  wallLoad_kPa: number;
  loadAddition_pct: number;
  mu: number;
  crane: CraneInput;
  prices: SteelPrices;
}

export interface ProfileResult {
  rank: number;
  profileName: string;
  steel: SteelGrade;
  struts: number;
  Ry_MPa: number;
  utilizationSigma: number;
  utilizationStabX: number;
  utilizationStabY: number;
  utilizationSlendX: number;
  utilizationSlendY: number;
  maxUtilization: number;
  limitingCheck: string;
  mass_per_m: number;
  columnMass_kg: number;
  strutCount: number;
  totalMass_kg: number;
  cost_rub: number;
}

export interface CalculationOutput {
  N_kN: number;
  M_kNm: number;
  Q_kN: number;
  snowLoad_kPa: number;
  windPressure_kPa: number;
  windSuction_kPa: number;
  tributaryArea_m2: number;
  wallArea_m2: number;
  results: ProfileResult[];
}
