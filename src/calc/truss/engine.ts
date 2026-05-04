import type { TerrainType } from "../types";
import { calcWind } from "../wind";
import tubesJson from "../../data/truss/tubes.json";
import unitDiagramsJson from "../../data/truss/unit_diagrams.json";
import phiETableJson from "../../data/truss/phi_e_table.json";
import type {
  ProfileEvaluation,
  SectionForces,
  SectionResult,
  TrussInput,
  TrussLoads,
  TrussOutput,
  TrussSection,
  TubeProfile,
} from "./types";

const TUBES = tubesJson as TubeProfile[];
const UNIT_DIAGRAMS = unitDiagramsJson as UnitDiagrams;
const PHI_E_TABLE = phiETableJson as PhiETable;

const E_MPA = 2.06e5;

interface PhiETable {
  mef_cols: number[];
  rows: { lambda_norm: number; phi: number[] }[];
}

interface UnitTable {
  [span: string]: Record<string, number>; // section → coefficient
}
interface UnitDiagrams {
  snow: UnitTable;
  roof: UnitTable;
  wind_columns: UnitTable;
  wind_roof: UnitTable;
}

const SECTION_KEYS_PRIMARY: Record<TrussSection, string> = {
  VP: "VP_N",
  NP: "NP_Np",
  ORb: "ORb_Np",
  OR: "ORm_Np",
  RR: "RR_Np",
};
const SECTION_KEYS_NEGATIVE: Record<TrussSection, string | null> = {
  VP: null,
  NP: null,
  ORb: "ORb_Nm",
  OR: "ORm_Nm",
  RR: "RR_Nm",
};

/**
 * Линейная интерполяция unit-эпюры по пролёту.
 * Excel: span ≤ 18 → 18, span ∈ (18,24] → между 18 и 24, span ∈ (24,30] → между 24 и 30.
 */
function interpUnit(table: UnitTable, span_m: number, sectionKey: string): number {
  const lo = Math.max(18, Math.floor(span_m / 6) * 6);
  const hi = Math.max(18, Math.ceil(span_m / 6) * 6);
  const vLo = table[String(lo)]?.[sectionKey] ?? 0;
  const vHi = table[String(hi)]?.[sectionKey] ?? vLo;
  if (lo === hi) return vLo;
  const frac = (span_m - lo) / 6;
  return vLo + (vHi - vLo) * frac;
}

function combineForce(
  sectionKey: string,
  span_m: number,
  loads: TrussLoads,
  loadAddition_pct: number,
): number {
  const a = interpUnit(UNIT_DIAGRAMS.snow, span_m, sectionKey) * loads.snow_kN_per_m;
  const b = interpUnit(UNIT_DIAGRAMS.roof, span_m, sectionKey) * loads.roof_kN_per_m;
  const c = interpUnit(UNIT_DIAGRAMS.wind_columns, span_m, sectionKey) * loads.wind_kN_per_m;
  const d = interpUnit(UNIT_DIAGRAMS.wind_roof, span_m, sectionKey) * loads.wind_kN_per_m;
  return (a + b + c + d) * (1 + loadAddition_pct / 100);
}

/** Расчётные нагрузки по СП 20.13330: возвращает D1, D2, D3 из Excel. */
export function computeLoads(input: TrussInput): TrussLoads {
  // Снег: 1.4 * 1.1 * 1.13 * Sg * cos(α) * γₙ * шаг рам
  const slopeRad = (input.roofSlope_deg / 180) * Math.PI;
  const snow =
    1.4 *
    1.1 *
    1.13 *
    input.Sg_kPa *
    Math.cos(slopeRad) *
    input.responsibilityCoeff *
    input.framePitch_m;

  // Ветер: G35 (FGH+ итого) * γₙ * шаг рам
  const wind =
    calcWind(
      input.w0_kPa,
      input.terrainType,
      input.height_m,
      input.span_m,
      input.length_m,
    ).verticalRoof_kPa *
    input.responsibilityCoeff *
    input.framePitch_m;

  // Покрытие: q покрытия * γₙ * шаг рам
  const roof = input.roofLoad_kPa * input.responsibilityCoeff * input.framePitch_m;

  return { snow_kN_per_m: snow, wind_kN_per_m: wind, roof_kN_per_m: roof };
}

/** Усилия в каждой секции из единичных эпюр. */
export function computeForces(input: TrussInput, loads: TrussLoads): Record<TrussSection, SectionForces> {
  const span = input.span_m;
  const add = input.loadAddition_pct;
  const VP_N = combineForce("VP_N", span, loads, add);
  const VP_M = combineForce("VP_M", span, loads, add);
  const VP_Q = combineForce("VP_Q", span, loads, add);
  const NP_Np = combineForce("NP_Np", span, loads, add);
  const ORb_Np = combineForce("ORb_Np", span, loads, add);
  const ORb_Nm = combineForce("ORb_Nm", span, loads, add);
  const OR_Np = combineForce("ORm_Np", span, loads, add);
  const OR_Nm = combineForce("ORm_Nm", span, loads, add);
  const RR_Np = combineForce("RR_Np", span, loads, add);
  const RR_Nm = combineForce("RR_Nm", span, loads, add);

  return {
    VP: { N_kN: VP_N, M_kNm: VP_M, Q_kN: VP_Q },
    NP: { N_kN: NP_Np, M_kNm: 0, Q_kN: 0 },
    ORb: { N_kN: 0, M_kNm: 0, Q_kN: 0, Np_kN: ORb_Np, Nm_kN: ORb_Nm },
    OR: { N_kN: 0, M_kNm: 0, Q_kN: 0, Np_kN: OR_Np, Nm_kN: OR_Nm },
    RR: { N_kN: 0, M_kNm: 0, Q_kN: 0, Np_kN: RR_Np, Nm_kN: RR_Nm },
  };
}

/** Ry по марке стали с понижающим к-том 1/1.025 (как в Excel). */
function getRyForTube(t_mm: number): number {
  // Excel: =IF(MAX(t)<=10, 345, 325)/1.025
  return (t_mm <= 10 ? 345 : 325) / 1.025;
}

/** φ для центрально сжатого: формула 7 СП 16.13330 (двутавры/трубы — α=0.04, β=0.09). */
function calcPhi(lambda_norm: number, alpha: number, beta: number): number {
  if (lambda_norm < 1e-9) return 1;
  const delta = 9.87 * (1 - alpha + beta * lambda_norm) + lambda_norm * lambda_norm;
  const inner = delta * delta - 39.48 * lambda_norm * lambda_norm;
  if (inner < 0) return 1;
  return (0.5 * (delta - Math.sqrt(inner))) / (lambda_norm * lambda_norm);
}

/** Find idx i such that arr[i] <= val < arr[i+1]; binary-like, MATCH(val, arr, 1) Excel semantics. */
function matchLE(arr: number[], val: number): number {
  if (val < arr[0]) return -1;
  for (let i = arr.length - 1; i >= 0; i--) {
    if (arr[i] <= val) return i;
  }
  return -1;
}

/** Excel `MATCH(AP3, $A$6:$A$21, 1) + 1` — следующий индекс λ выше текущего. */
function nextLambdaIdx(lambda_norm: number): number {
  if (lambda_norm < 0.5) return 0; // first row (λ=0.5)
  const i = matchLE(
    PHI_E_TABLE.rows.map((r) => r.lambda_norm),
    lambda_norm,
  );
  if (i < 0) return 0;
  return Math.min(i + 1, PHI_E_TABLE.rows.length - 1);
}

/** Excel `MATCH(AU, mef_cols, 1) + 1`. */
function nextMefIdx(mef: number): number {
  const i = matchLE(PHI_E_TABLE.mef_cols, mef);
  if (i < 0) return 0;
  return Math.min(i + 1, PHI_E_TABLE.mef_cols.length - 1);
}

/** φₑ из таблицы Лист6 для (λ_прив, mef). */
function lookupPhiE(lambda_norm: number, mef: number): number {
  const lamIdx = nextLambdaIdx(lambda_norm);
  const mefIdx = nextMefIdx(mef);
  const v = PHI_E_TABLE.rows[lamIdx].phi[mefIdx] ?? 0;
  return Math.max(0.001, v);
}

interface VPCheckResult {
  /** AG: K-т исп по устойчивости (формула 7) */
  K_stab7: number;
  /** AJ: K-т исп по прочности (формула 106) */
  K_strength106: number;
  /** AN: K-т исп по эквивалентным напряжениям (формула 44) */
  K_equiv44: number;
  /** AX: K-т исп по устойчивости (формула 109, внецентренное сжатие) */
  K_stab109: number;
  /** BE: K-т исп по устойчивости (формула 120, изгиб со сжатием) */
  K_stab120: number;
  lambda_x: number;
  lambda_y: number;
}

function checkVP(
  prof: TubeProfile,
  Ry: number,
  N: number,
  M: number,
  Q: number,
  lefx: number,
  lefy: number,
): VPCheckResult {
  const A = prof.A_cm2;
  const Wx = prof.Wx_cm3;
  const Ix = prof.Ix_cm4;
  const Sx = prof.Sx_cm3;
  const ix = prof.ix_cm;
  const iy = prof.iy_cm;
  const t = prof.t_mm;

  const lam_x = (lefx * 100) / ix;
  const lam_y = (lefy * 100) / iy;
  const lam_xn = lam_x * Math.sqrt(Ry / E_MPA);
  const lam_yn = lam_y * Math.sqrt(Ry / E_MPA);
  const maxLamN = Math.max(lam_xn, lam_yn);

  const alpha = 0.03;
  const beta = 0.06;
  const phiMin = calcPhi(maxLamN, alpha, beta);
  const phiY = calcPhi(lam_yn, alpha, beta);

  // AG: N / (φmin * A * Ry) — kN/(cm² * MPa) → нужен пересчёт
  // Excel: =$B$8/(AD3*N3/10^4*I3*10^3) where N — кН, A_cm2/10^4 — м², Ry MPa*10^3 → Па (т.е. =N_кН/(φ*A_м2*Ry_кПа))
  const A_m2 = A / 1e4; // см² → м²
  const Ry_kPa = Ry * 1e3; // МПа → кПа
  const Wx_m3 = Wx / 1e6; // см³ → м³
  const Ix_m4 = Ix / 1e8;
  const Sx_m3 = Sx / 1e6;
  const t_m = t / 1e3;

  // AG3: =N/(φmin*A_m2*Ry_kPa)
  const K_stab7 = N / (phiMin * A_m2 * Ry_kPa);

  // AJ3 (formula 106): =((N/A_m2 + M/Wx_m3)/1000) / Ry_MPa
  // т.е. K = (N/A + M/Wx) / Ry, где напряжения переводятся в МПа
  const sigma_NM_MPa = N / A_m2 / 1e3 + M / Wx_m3 / 1e3;
  const K_strength106 = sigma_NM_MPa / Ry;

  // AN3 (formula 44, equivalent stresses):
  // σ_N = N/A (МПа), τ = Q*Sx/(Ix*2t) (МПа)
  // K = 0.87 * sqrt(σ² + 3τ²) / Ry
  const sigma_N_MPa = N / A_m2 / 1e3;
  const tau_MPa = (Q * Sx_m3) / (Ix_m4 * 2 * t_m) / 1e3;
  const K_equiv44 = (0.87 * Math.sqrt(sigma_N_MPa ** 2 + 3 * tau_MPa ** 2)) / Ry;

  // AX3 (formula 109, eccentric compression):
  // e = M/N, m = e*A/Wx, η=1.2, mef = m*η, φₑ = lookupPhiE(min(λx,λy)_прив, mef)
  // K = N/(φₑ*A*Ry)
  const e = M / N;
  const m = (e * A_m2) / Wx_m3;
  const eta = 1.2;
  const mef = m * eta;
  const lamMinN = Math.min(lam_xn, lam_yn);
  const phiE = lookupPhiE(lamMinN, mef);
  const K_stab109 = N / (phiE * A_m2 * Ry_kPa);

  // BE3 (formula 120, bending+compression with cx):
  // δx = max(0.001, 1 - 0.1 * N * λx_n² / (A_m2 * Ry_kPa))
  // cx = 1.12 (примерно из Excel BD3=1.12, Af/Aw для трубы)
  // K = N/(φy*A*Ry) + M/(cx*δx*Wx*Ry)
  const delta_x = Math.max(0.001, 1 - (0.1 * N * lam_xn * lam_xn) / (A_m2 * Ry_kPa));
  const cx = 1.12;
  const K_stab120 = N / (phiY * A_m2 * Ry_kPa) + M / (cx * delta_x * Wx_m3 * Ry_kPa);

  return { K_stab7, K_strength106, K_equiv44, K_stab109, K_stab120, lambda_x: lam_x, lambda_y: lam_y };
}

interface SimpleCheckResult {
  /** Для НП (растяжение, прочность по N): */
  K_strength5?: number;
  /** Для раскосов (прочность от max|N|): */
  K_strength?: number;
  /** Для раскосов (устойчивость от |N-|): */
  K_stability?: number;
  lambda_x: number;
  lambda_y: number;
}

function checkNP(
  prof: TubeProfile,
  Ry: number,
  N: number,
  lefx: number,
  lefy: number,
): SimpleCheckResult {
  const A_m2 = prof.A_cm2 / 1e4;
  const Ry_kPa = Ry * 1e3;
  const lam_x = (lefx * 100) / prof.ix_cm;
  const lam_y = (lefy * 100) / prof.iy_cm;
  // Excel Z3 = N/(A*Ry)
  const K = N / (A_m2 * Ry_kPa);
  return { K_strength5: K, lambda_x: lam_x, lambda_y: lam_y };
}

function checkDiag(
  prof: TubeProfile,
  Ry: number,
  Np: number,
  Nm: number,
  lefx: number,
  lefy: number,
): SimpleCheckResult {
  const A_m2 = prof.A_cm2 / 1e4;
  const Ry_kPa = Ry * 1e3;
  const lam_x = (lefx * 100) / prof.ix_cm;
  const lam_y = (lefy * 100) / prof.iy_cm;
  const lam_xn = lam_x * Math.sqrt(Ry / E_MPA);
  const lam_yn = lam_y * Math.sqrt(Ry / E_MPA);
  const phi = calcPhi(Math.max(lam_xn, lam_yn), 0.03, 0.06);
  // Excel ОРб AE3: K = N+/(A*Ry) — прочность по растяжению
  const K_strength = Np / (A_m2 * Ry_kPa);
  // AF3: K = N-/(φ*A*Ry) — устойчивость по сжатию
  const K_stability = Nm / (phi * A_m2 * Ry_kPa);
  return { K_strength, K_stability, lambda_x: lam_x, lambda_y: lam_y };
}

/** Длина одной части (для расчёта массы), м. */
function memberLength(section: TrussSection, span_m: number, slopeRad: number): number {
  switch (section) {
    case "VP":
      return span_m / Math.cos(slopeRad);
    case "NP":
      return span_m - 2.4;
    case "ORb":
      return 1.9 * 4;
    case "OR":
      return 2.0 * 4;
    case "RR": {
      const n = span_m <= 18 ? 4 : span_m <= 24 ? 8 : 12;
      return 2.3 * n;
    }
  }
}

function lengthsForSection(input: TrussInput, section: TrussSection): { lefx: number; lefy: number } {
  // Длины для гибкости (lefx, lefy)
  const purlin_m = input.purlinPitch_mm > 0 ? input.purlinPitch_mm / 1000 : 3;
  switch (section) {
    case "VP":
      return { lefx: 3, lefy: purlin_m };
    case "NP":
      return { lefx: purlin_m, lefy: 6 };
    case "ORb":
      return { lefx: 1.9, lefy: 1.9 };
    case "OR":
      return { lefx: 2, lefy: 2 };
    case "RR":
      return { lefx: 2.5, lefy: 2.5 };
  }
}

function evaluateProfileForSection(
  section: TrussSection,
  prof: TubeProfile,
  forces: SectionForces,
  lefx: number,
  lefy: number,
  member_length_m: number,
  input: TrussInput,
  selectedWidthLimit: number | null,
): ProfileEvaluation {
  const Ry = getRyForTube(prof.t_mm);
  const checks: Record<string, number> = {};
  let lam_x = 0, lam_y = 0;
  let max_K = 0;
  let limiting = "";

  if (section === "VP") {
    const r = checkVP(prof, Ry, forces.N_kN, forces.M_kNm, forces.Q_kN, lefx, lefy);
    checks["устойчивость (7)"] = r.K_stab7;
    checks["прочность (106)"] = r.K_strength106;
    checks["экв. напряжения (44)"] = r.K_equiv44;
    checks["устойчивость (109)"] = r.K_stab109;
    checks["изгиб со сжатием (120)"] = r.K_stab120;
    lam_x = r.lambda_x;
    lam_y = r.lambda_y;
  } else if (section === "NP") {
    const r = checkNP(prof, Ry, forces.N_kN, lefx, lefy);
    checks["прочность (5)"] = r.K_strength5 ?? 0;
    lam_x = r.lambda_x;
    lam_y = r.lambda_y;
  } else {
    const r = checkDiag(prof, Ry, forces.Np_kN ?? 0, forces.Nm_kN ?? 0, lefx, lefy);
    checks["прочность (5)"] = r.K_strength ?? 0;
    checks["устойчивость (7)"] = r.K_stability ?? 0;
    lam_x = r.lambda_x;
    lam_y = r.lambda_y;
  }

  const entries = Object.entries(checks);
  for (const [name, val] of entries) {
    if (val > max_K) {
      max_K = val;
      limiting = name;
    }
  }

  // Filters (Excel BG3/AB3/AH3)
  const slendLimit = section === "NP" ? 400 : section === "OR" || section === "RR" ? 150 : 120;
  const passUtil = max_K <= input.maxUtilization;
  const passSlend = Math.max(lam_x, lam_y) <= slendLimit;
  const passThickness = prof.t_mm >= input.minThickness_mm[section];
  const passWidth = (() => {
    if (section === "VP") return prof.b_mm <= input.maxWidth_mm.VP;
    if (section === "NP") return prof.b_mm <= input.maxWidth_mm.NP;
    // диагональ: b ≤ min(VPb, NPb) и b ≥ minWidth
    const min_b = input.minWidth_mm[section as "ORb" | "OR" | "RR"];
    if (prof.b_mm < min_b) return false;
    if (selectedWidthLimit !== null && prof.b_mm > selectedWidthLimit) return false;
    return true;
  })();

  let failReason: string | null = null;
  if (!passUtil) failReason = `${limiting}=${max_K.toFixed(2)}>${input.maxUtilization}`;
  else if (!passSlend) failReason = `λ=${Math.max(lam_x, lam_y).toFixed(0)}>${slendLimit}`;
  else if (!passThickness) failReason = `t=${prof.t_mm}<${input.minThickness_mm[section]}`;
  else if (!passWidth) failReason = `ширина не подходит`;

  const totalMass = member_length_m * prof.mass_kg_per_m * 1.15;

  return {
    profile: prof,
    Ry_MPa: Ry,
    lambda_x: lam_x,
    lambda_y: lam_y,
    checks,
    maxUtilization: max_K,
    limitingCheck: limiting,
    passes: failReason === null,
    failReason,
    totalMass_kg: totalMass,
  };
}

function runSection(
  section: TrussSection,
  forces: SectionForces,
  input: TrussInput,
  selectedWidthLimit: number | null,
): SectionResult {
  const slopeRad = (input.roofSlope_deg / 180) * Math.PI;
  const member_length_m = memberLength(section, input.span_m, slopeRad);
  const { lefx, lefy } = lengthsForSection(input, section);

  const evals: { e: ProfileEvaluation; idx: number }[] = [];
  for (let i = 0; i < TUBES.length; i++) {
    const prof = TUBES[i];
    if (prof.excluded) continue;
    const e = evaluateProfileForSection(
      section,
      prof,
      forces,
      lefx,
      lefy,
      member_length_m,
      input,
      selectedWidthLimit,
    );
    if (e.passes) evals.push({ e, idx: i });
  }
  // Sort: ascending by mass, with Excel-compatible tie-break.
  // Excel: ВП uses BI = mass - 1e-6*H (later index wins); other sections use +1e-6*H (earlier wins).
  const earlierWins = section !== "VP";
  evals.sort((a, b) => {
    const d = a.e.totalMass_kg - b.e.totalMass_kg;
    if (Math.abs(d) > 1e-6) return d;
    return earlierWins ? a.idx - b.idx : b.idx - a.idx;
  });
  const evalsList = evals.map((x) => x.e);
  return {
    section,
    forces,
    lefx_m: lefx,
    lefy_m: lefy,
    member_length_m,
    candidates: evalsList.slice(0, 50),
    selected: evalsList[0] ?? null,
  };
}

export function runTrussCalculation(input: TrussInput): TrussOutput {
  const loads = computeLoads(input);
  const forces = computeForces(input, loads);

  // 1) ВП и НП — без width-limit от других секций
  const VP = runSection("VP", forces.VP, input, null);
  const NP = runSection("NP", forces.NP, input, null);

  // 2) Раскосы ограничены min(VP_b, NP_b)
  const VP_b = VP.selected?.profile.b_mm ?? input.maxWidth_mm.VP;
  const NP_b = NP.selected?.profile.b_mm ?? input.maxWidth_mm.NP;
  const widthLimit = Math.min(VP_b, NP_b);

  const ORb = runSection("ORb", forces.ORb, input, widthLimit);
  const OR = runSection("OR", forces.OR, input, widthLimit);
  const RR = runSection("RR", forces.RR, input, widthLimit);

  const sections: Record<TrussSection, SectionResult> = { VP, NP, ORb, OR, RR };
  const sectionsMass = (Object.values(sections) as SectionResult[]).reduce(
    (s, r) => s + (r.selected?.totalMass_kg ?? 0),
    0,
  );
  // Excel: Общая масса = сумма секций + 2*2*4.81 (фасонки/детали соединений)
  const FITTINGS_MASS_KG = 2 * 2 * 4.81;
  const totalMass = sectionsMass + FITTINGS_MASS_KG;

  const warnings: string[] = [];
  for (const s of Object.values(sections) as SectionResult[]) {
    if (!s.selected) warnings.push(`Не подобрано для секции ${s.section}`);
  }

  const unitMass = totalMass / (input.span_m * input.framePitch_m);

  return {
    loads,
    sections,
    totalMass_kg: totalMass,
    unitMass_kg_per_m2: unitMass,
    warnings,
  };
}

/** Утилита для отображения форм. */
export function getDefaultMinThickness(): Record<TrussSection, number> {
  return { VP: 4, NP: 4, ORb: 4, OR: 4, RR: 3 };
}
