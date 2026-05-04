import { runPurlinCalculation, getCassetteHeightFilter } from "../src/calc/purlin/engine";
import type { PurlinInput } from "../src/calc/purlin/types";

function runScenario(name: string, overrides: Partial<PurlinInput>) {
  const base: PurlinInput = {
    gamma_n: 1,
    roofShape: "gable",
    span_m: 24,
    length_m: 60,
    height_m: 12,
    roofSlope_deg: 6,
    framePitch_m: 6,
    terrainType: "B",
    w0_kPa: 0.6,
    Sg_kPa: 2.45,
    roofStructure: "С-П 150 мм",
    roofLoad_kPa: 0.32028,
    snowDrift: "none",
    drift_dropHeight_m: 4.5,
    drift_existingSize_m: 9.5,
    maxStep_mm: 1500,
    minStep_mm: 1500,
    snowGuardPurlin: false,
    fencePurlin: false,
    maxUtilization: "default",
    cassetteHeightFilter_mm: getCassetteHeightFilter("С-П 150 мм"),
  };
  const input = { ...base, ...overrides };
  if (overrides.roofStructure) {
    input.cassetteHeightFilter_mm = getCassetteHeightFilter(input.roofStructure);
  }
  const out = runPurlinCalculation(input);

  console.log(`\n### ${name}`);
  console.log(`  q_snow=${out.q_snow_kPa.toFixed(4)} q_wind=${out.q_windRoof_kPa.toFixed(4)} q_roof=${out.q_roof_kPa.toFixed(4)} q_total=${out.q_total_kPa.toFixed(4)} (μ₂=${out.mu2.toFixed(3)})`);
  for (const s of out.sections) {
    const c = s.best;
    if (!c) {
      console.log(`  ${s.grade} ${s.type}: -`);
    } else {
      console.log(
        `  ${s.grade} ${s.type}: ${c.profile.name}  step=${c.spacing_mm}  K=${c.K.toFixed(3)}  m/m=${c.profile.mass_kg_per_m.toFixed(3)}  m_frame=${c.massPerFrameStep_kg.toFixed(2)}  m_bldg=${c.massPerBuilding_kg.toFixed(2)}`,
      );
    }
  }
}

runScenario("S1 default (Уфа span=24 step=1500)", {});
runScenario("S2 span=18", { span_m: 18 });
runScenario("S3 span=30", { span_m: 30 });
runScenario("S4 наше 250 мм", { roofStructure: "наше 250 мм", roofLoad_kPa: 0.288 });
runScenario("S5 small snow Sg=1.2", { Sg_kPa: 1.2 });
runScenario("S6 large wind w0=1.2", { w0_kPa: 1.2 });
runScenario("S7 wide range 500..1500", { minStep_mm: 500, maxStep_mm: 1500 });
runScenario("S8 K=0.7", { maxUtilization: 0.7 });
