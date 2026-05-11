import {
  calculateCraneBeam,
  defaultCraneInputs,
  craneWorkbook,
} from "../src/calc/craneBeam/engine";

const expected = craneWorkbook.defaultScenario.expected;

console.log("\n=== Crane Beam default scenario ===");
console.log("Computing (this takes ~5-10 sec)...");
const t0 = Date.now();
const result = calculateCraneBeam(defaultCraneInputs);
const t1 = Date.now();
console.log(`Elapsed: ${(t1 - t0) / 1000}s`);

console.log(`\nProfile: ${result.profile}`);
console.log(`Utilization, %: ${result.utilizationPercent}`);
console.log(`Weight, kg: ${result.weightKg}`);
console.log(`Wheel load, kN: ${result.wheelLoadKn}`);
console.log(`Trolley mass, t: ${result.trolleyMassT}`);

const TOL = 1e-3;
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  let ok: boolean;
  if (typeof want === "number" && typeof got === "number") {
    ok = Math.abs(got - want) / Math.max(1, Math.abs(want)) < TOL;
  } else {
    ok = String(got).trim() === String(want).trim();
  }
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL ${name}: got=${String(got)} want=${String(want)}`);
  }
}

check("profile", result.profile, expected.profile);
check("utilizationPercent", result.utilizationPercent, expected.utilizationPercent);
check("weightKg", result.weightKg, expected.weightKg);

console.log(`\n=== Summary: ${pass}/${pass + fail} PASS ===`);
if (fail > 0) process.exit(1);
