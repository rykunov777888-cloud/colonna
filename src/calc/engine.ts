import type {
  CalculationInput,
  CalculationOutput,
  ProfileData,
  ProfileResult,
  SteelGrade,
} from "./types";
import { getRy, steelsForCategory, pricePerKg } from "./steel";
import { calcWind } from "./wind";
import profilesJson from "../data/profiles/profiles.json";

const PROFILES = profilesJson as ProfileData[];
const E_MPA = 206000;

function momentReductionCoeff(input: CalculationInput): number {
  const { columnType, perimeterTies, spanCount } = input;
  if (columnType === "fachwerk") return 0.35;

  const hasTies = perimeterTies;
  const multi = spanCount === "multi";

  if (columnType === "edge") {
    if (hasTies) return multi ? 0.3 : 0.55;
    return multi ? 0.9 : 1.0;
  }
  if (columnType === "middle") {
    if (hasTies) return multi ? 0.1 : 0.55;
    return multi ? 0.6 : 1.0;
  }
  return 0.35;
}

function tributaryArea(input: CalculationInput): number {
  const { columnType, span_m, framePitch_m, fachverkPitch_m } = input;
  if (columnType === "edge") return (span_m / 2) * framePitch_m;
  if (columnType === "middle") return span_m * framePitch_m;
  return (fachverkPitch_m * framePitch_m) / 2;
}

function wallArea(input: CalculationInput): number {
  const { columnType, height_m, framePitch_m, fachverkPitch_m } = input;
  if (columnType === "fachwerk") return height_m * fachverkPitch_m;
  return height_m * framePitch_m;
}

function calcCraneLoads(input: CalculationInput): {
  G_kN: number;
  T_kN: number;
  M_kNm: number;
} {
  const c = input.crane;
  if (!c.enabled) return { G_kN: 0, T_kN: 0, M_kNm: 0 };

  const step = input.framePitch_m;
  const y1 = 1;
  const y2 = y1 * (step - c.base_m) / step;
  const y3 = c.count === "two" ? y1 * (step - (c.clearance_m - c.base_m)) / step : 0;
  const y4 = c.count === "two" ? y1 * (step - c.clearance_m) / step : 0;
  const sumY = y1 + y2 + y3 + y4;

  const multiSpanFactor =
    input.spanCount === "multi" && input.columnType === "middle" && !c.singleSpan
      ? 2
      : 1;

  const G = c.wheelLoad_kN * sumY * 1.3 * 1.06 * multiSpanFactor;
  const T = 0.05 * G;

  let M: number;
  if (input.columnType === "middle") {
    M = (G * 0.75) / multiSpanFactor + T * c.railLevel_m;
  } else {
    M = G * 0.75 + T * c.railLevel_m;
  }

  return { G_kN: G, T_kN: T, M_kNm: M };
}

function calcPhi(lambdaBar: number, alpha: number, beta: number): number {
  if (lambdaBar <= 0.01) return 1;
  const delta = 9.87 * (1 - alpha + beta * lambdaBar) + lambdaBar * lambdaBar;
  const disc = delta * delta - 39.48 * lambdaBar * lambdaBar;
  if (disc < 0) return 0.001;
  return 0.5 * (delta - Math.sqrt(disc)) / (lambdaBar * lambdaBar);
}

function checkProfile(
  profile: ProfileData,
  steel: SteelGrade,
  struts: number,
  N_kN: number,
  M_kNm: number,
  input: CalculationInput,
  Ry: number,
): ProfileResult | null {
  const gamma_c = 0.95;
  const A_m2 = profile.A_cm2 / 10000;
  const Wx_m3 = profile.Wx_cm3 / 1e6;
  const ix_cm = profile.ix_cm;
  const iy_cm = profile.iy_cm;

  const mu = input.mu;
  const H = input.height_m;

  const lambdaBarX = (mu * H * 100 / ix_cm) * Math.sqrt(Ry / E_MPA);
  const lambdaBarY = (H / (struts + 1) * 100 / iy_cm) * Math.sqrt(Ry / E_MPA);

  const phiX = calcPhi(lambdaBarX, 0.04, 0.09);
  const phiY = calcPhi(lambdaBarY, 0.04, 0.14);

  const N_MN = N_kN / 1000;
  const M_MNm = M_kNm / 1000;

  const sigma = N_MN / A_m2 + M_MNm / Wx_m3;
  const utilizationSigma = sigma / (Ry * gamma_c);

  const stabX = Math.max(N_MN / (A_m2 * phiX / 2), M_MNm / (0.7 * Wx_m3));
  const utilizationStabX = stabX / (Ry * gamma_c);

  const mx = (M_kNm * 100 / N_kN) / (profile.Wx_cm3 / profile.A_cm2);
  const c = Math.min(1 / (1 + 0.7 * mx), 1);
  const stabY = N_MN / (A_m2 * phiY * c);
  const utilizationStabY = stabY / (Ry * gamma_c);

  const sigmaCompress = N_MN / (phiX * A_m2 * Ry * gamma_c);
  const slendLimitX = 180 - 60 * Math.max(0.5, sigmaCompress);
  const lambdaActualX = mu * H * 100 / ix_cm;
  const utilizationSlendX = lambdaActualX / slendLimitX;

  const sigmaCompressY = N_MN / (phiY * A_m2 * Ry * gamma_c);
  const slendLimitY = 180 - 60 * Math.max(0.5, sigmaCompressY);
  const lambdaActualY = H / (struts + 1) * 100 / iy_cm;
  const utilizationSlendY = lambdaActualY / slendLimitY;

  const maxUtil = Math.max(
    utilizationSigma,
    utilizationStabX,
    utilizationStabY,
    utilizationSlendX,
    utilizationSlendY,
  );

  if (maxUtil > 1 || maxUtil <= 0) return null;

  const checks: [number, string][] = [
    [utilizationSigma, "по σ"],
    [utilizationStabX, "по σ уст X"],
    [utilizationStabY, "по σ уст Y"],
    [utilizationSlendX, "по гибк X"],
    [utilizationSlendY, "по гибк Y"],
  ];
  const limitingCheck = checks.reduce((a, b) => (b[0] > a[0] ? b : a))[1];

  const strutStep =
    input.columnType === "fachwerk" ? input.fachverkPitch_m : input.framePitch_m;
  const strutMass = struts * 12 * strutStep * 1.15;
  const columnMass = profile.mass_kg_per_m * H;
  const totalMass = columnMass + strutMass;
  const cost =
    totalMass * pricePerKg(steel, input.prices) / 1000;

  return {
    rank: 0,
    profileName: profile.name,
    steel,
    struts,
    Ry_MPa: Ry,
    utilizationSigma,
    utilizationStabX,
    utilizationStabY,
    utilizationSlendX,
    utilizationSlendY,
    maxUtilization: maxUtil,
    limitingCheck,
    mass_per_m: profile.mass_kg_per_m,
    columnMass_kg: columnMass,
    strutCount: struts,
    totalMass_kg: totalMass,
    cost_rub: cost,
  };
}

export function runCalculation(input: CalculationInput): CalculationOutput {
  const gamma_f_snow = 1.4;
  const gamma_f_wind = 1.4;
  const gamma_n = input.responsibilityCoeff;

  const snowCalc =
    gamma_f_snow * input.Sg_kPa * Math.cos((input.roofSlope_deg * Math.PI) / 180) * gamma_n;

  const wind = calcWind(
    input.w0_kPa,
    input.terrainType,
    input.height_m,
    input.span_m,
    input.length_m,
  );
  const windHoriz = wind.horizontalPressure_kPa * gamma_n;
  const windVert = wind.verticalRoof_kPa * gamma_n;

  const roofCalc = input.roofLoad_kPa * gamma_n;
  const wallCalc = input.wallLoad_kPa * gamma_n;

  const areaVert = tributaryArea(input);
  const areaWall = wallArea(input);

  const crane = calcCraneLoads(input);

  const N =
    ((snowCalc + windVert + roofCalc) * areaVert +
      wallCalc * areaWall +
      crane.G_kN) *
    (1 + input.loadAddition_pct / 100);

  const pitch =
    input.columnType === "fachwerk" ? input.fachverkPitch_m : input.framePitch_m;
  const momentBase =
    windHoriz * pitch * input.height_m * input.height_m / 2;
  const momentCoeff = momentReductionCoeff(input);

  const M = momentBase * momentCoeff + crane.M_kNm;

  const allResults: ProfileResult[] = [];

  for (const profile of PROFILES) {
    const steels = steelsForCategory(profile.category);
    for (const steel of steels) {
      const Ry = getRy(steel, profile);
      for (let struts = 0; struts <= 4; struts++) {
        const res = checkProfile(profile, steel, struts, N, M, input, Ry);
        if (res) allResults.push(res);
      }
    }
  }

  allResults.sort((a, b) => a.totalMass_kg - b.totalMass_kg);

  const top = allResults.slice(0, 50);
  top.forEach((r, i) => (r.rank = i + 1));

  return {
    N_kN: N,
    M_kNm: M,
    Q_kN: 0,
    snowLoad_kPa: snowCalc,
    windPressure_kPa: windHoriz,
    windSuction_kPa: windVert,
    tributaryArea_m2: areaVert,
    wallArea_m2: areaWall,
    results: top,
  };
}
