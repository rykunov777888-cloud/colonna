// Verify truss engine against Excel default scenario.
import {
  runTrussCalculation,
  computeLoads,
  computeForces,
  getDefaultMinThickness,
} from "../src/calc/truss/engine";
import type { TrussInput } from "../src/calc/truss/types";

const input: TrussInput = {
  height_m: 12,
  span_m: 24,
  length_m: 30,
  framePitch_m: 6,
  purlinPitch_mm: 0,
  roofSlope_deg: 6,
  responsibilityCoeff: 1,
  terrainType: "B",
  w0_kPa: 0.3,
  Sg_kPa: 1.2,
  roofStructure: "наше 250 мм",
  roofLoad_kPa: 0.24,
  loadAddition_pct: 15,
  maxUtilization: 0.85,
  minThickness_mm: getDefaultMinThickness(),
  maxWidth_mm: { VP: 500, NP: 500 },
  minWidth_mm: { ORb: 80, OR: 80, RR: 60 },
};

const expected = {
  loads: { snow: 12.4608, wind: 0.6415, roof: 1.44 },
  forces: {
    VP: { N: 629.36, M: 20.51, Q: 197.51 },
    NP: { N: 639.32 },
    ORb: { Np: 303.58, Nm: 236.19 },
    OR: { Np: 122.27, Nm: 102.56 },
    RR: { Np: 29.29, Nm: 24.42 },
  },
  selected: {
    VP: { name: "тр.200х160х6", mass: 889.45, K: 0.7802 },
    NP: { name: "тр.120х5", mass: 435.94, K: 0.8495 },
    ORb: { name: "тр.80х4", mass: 80.58, K: 0.7676 },
    OR: { name: "тр.80х4", mass: 84.82, K: 0.3327 },
    RR: { name: "тр.60х3", mass: 109.82, K: 0.2573 },
  },
};

const out = runTrussCalculation(input);

function pct(actual: number, exp: number): string {
  if (Math.abs(exp) < 1e-9) return "0.00%";
  return `${((actual - exp) / exp * 100).toFixed(2)}%`;
}

console.log("=== Loads ===");
console.log(`  snow: ${out.loads.snow_kN_per_m.toFixed(4)} (Excel ${expected.loads.snow}, Δ=${pct(out.loads.snow_kN_per_m, expected.loads.snow)})`);
console.log(`  wind: ${out.loads.wind_kN_per_m.toFixed(4)} (Excel ${expected.loads.wind}, Δ=${pct(out.loads.wind_kN_per_m, expected.loads.wind)})`);
console.log(`  roof: ${out.loads.roof_kN_per_m.toFixed(4)} (Excel ${expected.loads.roof}, Δ=${pct(out.loads.roof_kN_per_m, expected.loads.roof)})`);

console.log("\n=== Forces ===");
const f = computeForces(input, out.loads);
console.log(`  VP_N: ${f.VP.N_kN.toFixed(2)} (Excel ${expected.forces.VP.N}, Δ=${pct(f.VP.N_kN, expected.forces.VP.N)})`);
console.log(`  VP_M: ${f.VP.M_kNm.toFixed(2)} (Excel ${expected.forces.VP.M}, Δ=${pct(f.VP.M_kNm, expected.forces.VP.M)})`);
console.log(`  VP_Q: ${f.VP.Q_kN.toFixed(2)} (Excel ${expected.forces.VP.Q}, Δ=${pct(f.VP.Q_kN, expected.forces.VP.Q)})`);
console.log(`  NP_N: ${f.NP.N_kN.toFixed(2)} (Excel ${expected.forces.NP.N}, Δ=${pct(f.NP.N_kN, expected.forces.NP.N)})`);
console.log(`  ORb_Np: ${(f.ORb.Np_kN ?? 0).toFixed(2)} (Excel ${expected.forces.ORb.Np}, Δ=${pct(f.ORb.Np_kN ?? 0, expected.forces.ORb.Np)})`);
console.log(`  ORb_Nm: ${(f.ORb.Nm_kN ?? 0).toFixed(2)} (Excel ${expected.forces.ORb.Nm}, Δ=${pct(f.ORb.Nm_kN ?? 0, expected.forces.ORb.Nm)})`);
console.log(`  OR_Np: ${(f.OR.Np_kN ?? 0).toFixed(2)} (Excel ${expected.forces.OR.Np}, Δ=${pct(f.OR.Np_kN ?? 0, expected.forces.OR.Np)})`);
console.log(`  OR_Nm: ${(f.OR.Nm_kN ?? 0).toFixed(2)} (Excel ${expected.forces.OR.Nm}, Δ=${pct(f.OR.Nm_kN ?? 0, expected.forces.OR.Nm)})`);
console.log(`  RR_Np: ${(f.RR.Np_kN ?? 0).toFixed(2)} (Excel ${expected.forces.RR.Np}, Δ=${pct(f.RR.Np_kN ?? 0, expected.forces.RR.Np)})`);
console.log(`  RR_Nm: ${(f.RR.Nm_kN ?? 0).toFixed(2)} (Excel ${expected.forces.RR.Nm}, Δ=${pct(f.RR.Nm_kN ?? 0, expected.forces.RR.Nm)})`);

console.log("\n=== Selected profiles ===");
for (const sect of ["VP", "NP", "ORb", "OR", "RR"] as const) {
  const sel = out.sections[sect].selected;
  const exp = expected.selected[sect];
  if (!sel) {
    console.log(`  ${sect}: NOT SELECTED (Excel: ${exp.name})`);
    continue;
  }
  const matchName = sel.profile.name === exp.name ? "✓" : "✗";
  console.log(
    `  ${sect}: ${sel.profile.name} (mass=${sel.totalMass_kg.toFixed(2)}, K=${sel.maxUtilization.toFixed(4)}, lim=${sel.limitingCheck})  | Excel: ${exp.name} (mass=${exp.mass}, K=${exp.K})  ${matchName}`,
  );
}

console.log(`\nTotal: ${out.totalMass_kg.toFixed(2)} kg`);
console.log(`Per m²: ${out.unitMass_kg_per_m2.toFixed(2)} kg/m²`);
if (out.warnings.length) console.log("WARNINGS:", out.warnings);
