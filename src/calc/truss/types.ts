import type { TerrainType } from "../types";

export type TrussSection = "VP" | "NP" | "ORb" | "OR" | "RR";

export const TRUSS_SECTIONS: TrussSection[] = ["VP", "NP", "ORb", "OR", "RR"];

export const TRUSS_SECTION_LABELS: Record<TrussSection, string> = {
  VP: "Верхний пояс",
  NP: "Нижний пояс",
  ORb: "Опорный раскос балочный",
  OR: "Опорный раскос рамный",
  RR: "Рядовой раскос",
};

export const TRUSS_SECTION_SHORT: Record<TrussSection, string> = {
  VP: "ВП",
  NP: "НП",
  ORb: "ОРб",
  OR: "ОР",
  RR: "РР",
};

export interface TubeProfile {
  name: string;
  h_mm: number;
  b_mm: number;
  t_mm: number;
  A_cm2: number;
  Ix_cm4: number;
  Wx_cm3: number;
  ix_cm: number;
  Sx_cm3: number;
  Iy_cm4: number;
  Wy_cm3: number;
  iy_cm: number;
  mass_kg_per_m: number;
  /** Профиль исключён из подбора (нестандартные толщины). Excel: "Исключалка"="-". */
  excluded: boolean;
}

export interface TrussInput {
  height_m: number;
  span_m: number;
  length_m: number;
  framePitch_m: number;
  /** Шаг прогонов, мм. 0 = прогоны не используются (распорки 3 м для ВП). */
  purlinPitch_mm: number;
  roofSlope_deg: number;
  responsibilityCoeff: number;
  terrainType: TerrainType;
  w0_kPa: number;
  Sg_kPa: number;
  /** Roof structure id from `structures.json` (autofills `roofLoad_kPa`). */
  roofStructure: string;
  roofLoad_kPa: number;
  loadAddition_pct: number;
  /** Максимальный к-т использования (Лист1 D39/D43/D47/D51/D55 = 0.85). */
  maxUtilization: number;
  /** Минимальные толщины ВП/НП/ОРб/ОР/РР, мм. */
  minThickness_mm: Record<TrussSection, number>;
  /** Максимальные ширины (для ВП/НП), мм. */
  maxWidth_mm: { VP: number; NP: number };
  /** Минимальные ширины раскосов (ОРб/ОР/РР), мм. */
  minWidth_mm: { ORb: number; OR: number; RR: number };
}

export interface SectionForces {
  /** Все усилия — кН / кН·м. */
  N_kN: number;
  M_kNm: number;
  Q_kN: number;
  /** Для раскосов: положительное (растяжение) и отрицательное (сжатие) значения N. */
  Np_kN?: number;
  Nm_kN?: number;
}

export interface ProfileEvaluation {
  profile: TubeProfile;
  Ry_MPa: number;
  lambda_x: number;
  lambda_y: number;
  /** Map of utilization checks: name → value. */
  checks: Record<string, number>;
  maxUtilization: number;
  limitingCheck: string;
  passes: boolean;
  failReason: string | null;
  totalMass_kg: number;
}

export interface SectionResult {
  section: TrussSection;
  forces: SectionForces;
  /** lefx, lefy в м. */
  lefx_m: number;
  lefy_m: number;
  /** Длина одной части (для расчёта массы), м. */
  member_length_m: number;
  /** Топ-50 проходящих профилей, отсортированных по массе. */
  candidates: ProfileEvaluation[];
  /** Самый лёгкий проходящий профиль (если есть). */
  selected: ProfileEvaluation | null;
}

export interface TrussLoads {
  snow_kN_per_m: number;
  wind_kN_per_m: number;
  roof_kN_per_m: number;
}

export interface TrussOutput {
  loads: TrussLoads;
  sections: Record<TrussSection, SectionResult>;
  /** Сумма масс всех 5 секций (отобранные профили). */
  totalMass_kg: number;
  /** Удельная масса фермы, кг/м² (на единицу площади покрытия). */
  unitMass_kg_per_m2: number;
  /** Если что-то не подобрано. */
  warnings: string[];
}
