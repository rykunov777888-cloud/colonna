import {
  calculateWindowRiegel,
  defaultWindowRiegelInputs,
  windowRiegelWorkbook,
} from "../src/calc/windowRiegel/engine";

const expected = windowRiegelWorkbook.defaultScenario.expected;

const result = calculateWindowRiegel(defaultWindowRiegelInputs);

console.log("\n=== Window Riegel default scenario ===");
console.log(`City: ${defaultWindowRiegelInputs.city}`);
console.log(
  `Vertical=${result.verticalLoadKpa} Horizontal=${result.horizontalLoadKpa} Wind=${result.effectiveWindLoadKpa}`,
);
console.log(
  `Lower #1: ${result.lowerAndUpperProfiles[0]?.profile} ${result.lowerAndUpperProfiles[0]?.steel} ${result.lowerAndUpperProfiles[0]?.weightKg}`,
);
console.log(
  `Upper Type1 #1: ${result.upperType1Profiles[0]?.profile} ${result.upperType1Profiles[0]?.steel} ${result.upperType1Profiles[0]?.weightKg}`,
);

const TOL = 1e-3;
let pass = 0;
let fail = 0;

function check(name: string, got: unknown, want: unknown) {
  let ok: boolean;
  if (typeof want === "number" && typeof got === "number") {
    ok = Math.abs(got - want) / Math.max(1, Math.abs(want)) < TOL;
  } else {
    ok = got === want;
  }
  if (ok) {
    pass++;
  } else {
    fail++;
    console.log(`  FAIL ${name}: got=${String(got)} want=${String(want)}`);
  }
}

check("lower #1 profile", result.lowerAndUpperProfiles[0]?.profile, expected.lowerFirstProfile);
check("lower #1 steel", result.lowerAndUpperProfiles[0]?.steel, expected.lowerFirstSteel);
check("lower #1 weight", result.lowerAndUpperProfiles[0]?.weightKg, expected.lowerFirstWeightKg);
check("upper #1 profile", result.upperType1Profiles[0]?.profile, expected.upperFirstProfile);
check("upper #1 steel", result.upperType1Profiles[0]?.steel, expected.upperFirstSteel);
check("upper #1 weight", result.upperType1Profiles[0]?.weightKg, expected.upperFirstWeightKg);

console.log(`\n=== Summary: ${pass}/${pass + fail} PASS ===`);
if (fail > 0) process.exit(1);
