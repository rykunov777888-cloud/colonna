// Compare truss engine outputs against Excel oracle results.
// Reads /tmp/oracle_out.json (produced by excel_oracle_truss.py)
// and runs the same scenarios through the engine, prints a diff.

import * as fs from "fs";
import { runTrussCalculation, getDefaultMinThickness } from "../src/calc/truss/engine";
import type { TrussInput, TrussSection } from "../src/calc/truss/types";

interface OracleScenario {
  idx: number;
  name: string;
  params: Record<string, string | number>;
  excel?: {
    selected: Record<string, { name: string; mass: number; K: number }>;
    totalMass: number;
    perM2: number;
  };
  error?: string;
}

const ORACLE_PATH = process.argv[2] ?? "/tmp/oracle_out.json";
const oracle = JSON.parse(fs.readFileSync(ORACLE_PATH, "utf8")) as OracleScenario[];

function buildInput(p: Record<string, string | number>): TrussInput {
  return {
    height_m: p.height as number,
    span_m: p.span as number,
    length_m: p.length as number,
    framePitch_m: p.frame_pitch as number,
    purlinPitch_mm: p.purlin_pitch_mm as number,
    roofSlope_deg: p.slope as number,
    responsibilityCoeff: p.gamma_n as number,
    terrainType: ((p.terrain as string) === "А" ? "A" : (p.terrain as string) === "В" ? "B" : "C") as "A" | "B" | "C",
    w0_kPa: p.w0 as number,
    Sg_kPa: p.sg as number,
    roofStructure: p.roof_struct as string,
    roofLoad_kPa: lookupRoofKpa(p.roof_struct as string),
    loadAddition_pct: p.addition as number,
    maxUtilization: 0.85,
    minThickness_mm: {
      VP: p.t_VP as number,
      NP: p.t_NP as number,
      ORb: p.t_ORb as number,
      OR: p.t_OR as number,
      RR: p.t_RR as number,
    },
    maxWidth_mm: { VP: p.w_VP_max as number, NP: p.w_NP_max as number },
    minWidth_mm: { ORb: p.w_ORb_min as number, OR: p.w_OR_min as number, RR: p.w_RR_min as number },
  };
}

// Hardcoded subset to mirror Excel's lookup table at Лист1 L255:M274
// (только нужные для сценариев)
const ROOF_KPA: Record<string, number> = {
  "наше 250 мм": 0.24,
  "наше 200 мм": 0.23,
  "наше 150 мм": 0.22,
  "наше 100 мм": 0.21,
  "С-П 250 мм": 0.452,
  "С-П 200 мм": 0.386,
  "С-П 150 мм": 0.32,
  "С-П 120 мм": 0.288,
  "С-П 100 мм": 0.254,
  "С-П 80 мм": 0.233,
  "С-П 50 мм": 0.192,
  "профлист": 0.105,
};
function lookupRoofKpa(id: string): number {
  return ROOF_KPA[id] ?? 0.24;
}

function pct(actual: number, exp: number): string {
  if (Math.abs(exp) < 1e-9) return "0.00%";
  return `${((actual - exp) / exp * 100).toFixed(2)}%`;
}

let totalAssertions = 0;
let totalPassed = 0;

for (const sc of oracle) {
  if (sc.error) {
    console.log(`\n=== ${sc.name} ===\nORACLE FAILED: ${sc.error}`);
    continue;
  }
  if (!sc.excel) continue;

  console.log(`\n=== ${sc.name} ===`);
  const input = buildInput(sc.params);
  void getDefaultMinThickness;
  const out = runTrussCalculation(input);

  const sections: TrussSection[] = ["VP", "NP", "ORb", "OR", "RR"];
  for (const sec of sections) {
    const e = sc.excel.selected[sec];
    const a = out.sections[sec].selected;
    if (!a) {
      console.log(`  ${sec}: NOT SELECTED (Excel: ${e.name})  ✗`);
      totalAssertions += 3;
      continue;
    }
    const nameMatch = a.profile.name === e.name;
    const massDelta = pct(a.totalMass_kg, e.mass);
    const kDelta = pct(a.maxUtilization, e.K);
    const massOk = Math.abs(a.totalMass_kg - e.mass) < 1.0;  // 1 kg tolerance
    const kOk = Math.abs(a.maxUtilization - e.K) < 0.01;     // 1% tolerance
    totalAssertions += 3;
    if (nameMatch) totalPassed++;
    if (massOk) totalPassed++;
    if (kOk) totalPassed++;
    console.log(
      `  ${sec.padEnd(3)}: ${a.profile.name.padEnd(20)} (m=${a.totalMass_kg.toFixed(1)}, K=${a.maxUtilization.toFixed(3)})  | Excel: ${e.name.padEnd(20)} (m=${e.mass.toFixed(1)}, K=${e.K.toFixed(3)})  ${nameMatch ? "✓" : "✗"} massΔ=${massDelta} KΔ=${kDelta}`,
    );
  }

  const totalDelta = pct(out.totalMass_kg, sc.excel.totalMass);
  const totalOk = Math.abs(out.totalMass_kg - sc.excel.totalMass) < 5.0;
  totalAssertions++;
  if (totalOk) totalPassed++;
  console.log(
    `  Total: ${out.totalMass_kg.toFixed(2)} kg  | Excel: ${sc.excel.totalMass.toFixed(2)} kg  Δ=${totalDelta}  ${totalOk ? "✓" : "✗"}`,
  );
}

console.log(`\n=================`);
console.log(`Passed: ${totalPassed}/${totalAssertions}`);
process.exit(totalPassed === totalAssertions ? 0 : 1);
