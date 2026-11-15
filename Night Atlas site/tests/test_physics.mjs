import assert from "node:assert/strict";
import {
  walkersLawSkyglow,
  computeScenarioMetrics,
  computeBaciStats,
  computeCalibrationMetrics,
  auditMunicipalInventory
} from "../js/physics.js";
import { CITY_PRESETS, SCENARIOS, generateGridFixtures } from "../js/presets.js";

// 1. Walker's Law monotonic decay & aerosol scattering test
const near = walkersLawSkyglow(40, 1.0, 0.2);
const far = walkersLawSkyglow(40, 2.0, 0.2);
assert.ok(near > far, "Skyglow must decay with distance");
assert.ok(
  walkersLawSkyglow(40, 1.0, 0.5) > walkersLawSkyglow(40, 1.0, 0.1),
  "Higher aerosol optical depth must increase skyglow scatter"
);

// 2. Unit separation & mitigation directionality test
const city = CITY_PRESETS.moscow_presnensky;
const base = computeScenarioMetrics(city, SCENARIOS.baseline, 23);
const retro = computeScenarioMetrics(city, SCENARIOS.shield_warm, 23);
assert.ok(retro.modeledRadiance < base.modeledRadiance, "Retrofit must reduce upward radiance");
assert.ok(retro.zenithSkyMag > base.zenithSkyMag, "Retrofit must darken zenith sky (higher mag/arcsec^2)");
assert.ok(retro.annualCost < base.annualCost, "Retrofit must reduce annual operating cost");

// 3. Fixture count sensitivity test (1 vs 100 lights must change sky brightness)
const cityOne = { ...city, fixtures: generateGridFixtures(city.center, 1, 4000, 140, 12) };
const cityHundred = { ...city, fixtures: generateGridFixtures(city.center, 100, 4000, 140, 12) };
const mOne = computeScenarioMetrics(cityOne, SCENARIOS.baseline, 22);
const mHundred = computeScenarioMetrics(cityHundred, SCENARIOS.baseline, 22);
assert.ok(mHundred.modeledRadiance > mOne.modeledRadiance, "100 lights must produce higher radiance than 1 light");
assert.ok(mHundred.zenithSkyMag < mOne.zenithSkyMag, "100 lights must brighten sky (lower mag/arcsec^2)");

// 4. Pole height sensitivity test (5m vs 30m must change ground illuminance)
const cityLowPole = { ...city, fixtures: generateGridFixtures(city.center, 16, 4000, 140, 5) };
const cityHighPole = { ...city, fixtures: generateGridFixtures(city.center, 16, 4000, 140, 30) };
const mLow = computeScenarioMetrics(cityLowPole, SCENARIOS.baseline, 22);
const mHigh = computeScenarioMetrics(cityHighPole, SCENARIOS.baseline, 22);
assert.notEqual(mLow.meanGroundLux, mHigh.meanGroundLux, "Changing pole height must affect ground illuminance");

// 5. BACI estimator test
const baci = computeBaciStats([50, 51, 49], [25, 24, 26], [45, 46, 44], [45, 46, 44]);
assert.ok(baci.deltaBaci < -20, "BACI delta should detect -25 nW drop");
assert.equal(baci.significant, true, "Drop should be statistically significant");

// 6. SQM calibration R^2 edge-case test (constant observed with 10-mag error must NOT return R^2 = 1)
const constantOff = computeCalibrationMetrics([
  { observed: 19.0, modeled: 29.0 },
  { observed: 19.0, modeled: 29.0 }
]);
assert.equal(constantOff.r2, null, "R^2 must be null when observed variance is 0");
assert.equal(constantOff.rmse, 10, "RMSE must reflect 10-mag offset");
assert.equal(constantOff.meanBias, 10, "Mean bias must reflect +10 mag offset");

// 7. Municipal audit priority test
const ranked = auditMunicipalInventory([
  { id: "GOOD", wattage: 80, cct: 2700, ufr: 0.01 },
  { id: "BAD", wattage: 180, cct: 5000, ufr: 0.18 }
]);
assert.equal(ranked[0].id, "BAD", "Worst offender should rank first");
assert.equal(ranked[1].compliant, true, "2700K UFR 0.01 fixture should be compliant");

console.log("All Night Atlas physics & statistical tests passed.");
