import assert from "node:assert/strict";
import {
  walkersLawSkyglow,
  computeScenarioMetrics,
  computeBaciStats,
  computeCalibrationMetrics,
  auditMunicipalInventory,
  computeSkyViewFactor,
  computeLightSpreadRadiusM,
  computeRayPolygonVisibility,
  computeGroundIlluminanceAt,
  traceFixture3D
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

// 8. 3D-building Sky View Factor test
const openSvf = computeSkyViewFactor(0, 15);
const canyonSvf = computeSkyViewFactor(30, 15);
assert.equal(openSvf, 1.0, "Open sky with 0m buildings must have SVF = 1.0");
assert.ok(canyonSvf < 0.6 && canyonSvf >= 0.25, "30m street canyon must reduce Sky View Factor");
const cityCanyon = {
  ...city,
  fixtures: city.fixtures.map((f) => ({ ...f, skyViewFactor: canyonSvf }))
};
const mOpen = computeScenarioMetrics(city, SCENARIOS.baseline, 22);
const mCanyon = computeScenarioMetrics(cityCanyon, SCENARIOS.baseline, 22);
assert.ok(mCanyon.modeledRadiance < mOpen.modeledRadiance, "Lower SVF must trap more passive uplight");

// 9. Height-based light spread & building ray-casting test
const rShort = computeLightSpreadRadiusM(5, 0.01);
const rTall = computeLightSpreadRadiusM(25, 0.14);
assert.ok(rTall > rShort * 3, "Taller pole must illuminate a wider ground radius in meters");
const wallBuilding = [
  {
    heightM: 20,
    ring: [
      [6.1433, 46.2040],
      [6.1435, 46.2040],
      [6.1435, 46.2048],
      [6.1433, 46.2048],
      [6.1433, 46.2040]
    ]
  }
];
const visPoly = computeRayPolygonVisibility([6.1432, 46.2044], 60, wallBuilding, 16, 10);
assert.equal(visPoly.length, 17, "Visibility polygon must close 16 rays + start vertex");
const eastRayLon = visPoly[0][0];
assert.ok(eastRayLon < 6.1434, "Eastward ray must stop at building wall before 60m");

console.log("All Night Atlas physics & statistical tests passed.");

// Regression: inventory spectrum edits must change modeled radiance.
const edited = structuredClone(city);
edited.fixtures.forEach((f) => { f.cct = 2200; f.ufr = 0; });
assert.ok(computeScenarioMetrics(edited, SCENARIOS.baseline, 23).modeledRadiance < base.modeledRadiance);
assert.throws(() => computeBaciStats([], [], [], []), RangeError);
assert.throws(() => computeBaciStats([1], [2], [3], [4]), RangeError);
assert.throws(() => computeBaciStats([1, Infinity], [2, 3], [3, 4], [4, 5]), RangeError);
const noVariance = computeBaciStats([50, 50], [25, 25], [45, 45], [45, 45]);
assert.equal(noVariance.ciLow, null);
assert.equal(noVariance.tStat, null);
const shortCurfew = computeScenarioMetrics(city, { ...SCENARIOS.curfew, curfewStartHour: 1, curfewEndHour: 2 }, 23);
assert.ok(shortCurfew.annualKwh > computeScenarioMetrics(city, SCENARIOS.curfew, 23).annualKwh);

// 10. Cosine-power photometry & 3D ray-building height occlusion test
const luxCutoff = computeGroundIlluminanceAt(0, 10, 120, 130, 1.0, 0.01);
const luxUnshielded = computeGroundIlluminanceAt(0, 10, 120, 130, 1.0, 0.25);
assert.ok(luxCutoff > luxUnshielded, "Full-cutoff optics must concentrate more flux directly beneath the pole");
const traceLowPole = traceFixture3D(
  { id: "T1", lon: 6.1432, lat: 46.2044, heightM: 10, wattage: 120, ufr: 0.14 },
  wallBuilding,
  1.0
);
const traceTallTower = traceFixture3D(
  { id: "T2", lon: 6.1432, lat: 46.2044, heightM: 100, wattage: 120, ufr: 0.14 },
  wallBuilding,
  1.0
);
assert.ok(traceLowPole.directEscapeFactor < 1.0, "10m pole next to 20m building must have blocked upward rays");
assert.equal(traceTallTower.directEscapeFactor, 1.0, "100m tower above 20m building must have unobstructed upper hemisphere");
assert.ok(traceLowPole.shadowedFraction > traceTallTower.shadowedFraction, "10m pole must cast more 3D building shadow than 100m tower");

console.log("Regression checks passed.");

// Close-zoom regressions: meter-based mesh covers the center, dims linearly,
// and clips against a long wall even when both endpoints lie far away.
const originFixture = {lon: 0, lat: 0, heightM: 10, wattage: 120, efficacyLmW: 130, ufr: 0.14};
const openMesh = traceFixture3D(originFixture);
const dimMesh = traceFixture3D(originFixture, [], 0.5);
assert.equal(openMesh.groundCells.length, 96 * 32);
assert.ok(openMesh.groundCells[0].polygon.some(([lon, lat]) => lon === 0 && lat === 0));
assert.deepEqual(openMesh.groundCells.map(c => c.polygon), dimMesh.groundCells.map(c => c.polygon));
assert.ok(Math.abs(dimMesh.groundCells[0].lux / openMesh.groundCells[0].lux - 0.5) < 1e-12);
const longWall = [{heightM: 30, ring: [[5,-200],[6,-200],[6,200],[5,200],[5,-200]].map(([x,y])=>[x/111320,y/111320])}];
const blockedMesh = traceFixture3D(originFixture, longWall);
assert.ok(blockedMesh.shadowedFraction > 0.3);
assert.ok(blockedMesh.groundCells.every(c => c.polygon.every(([lon]) => lon * 111320 <= 5.01)));
assert.equal(traceFixture3D(originFixture, [], 0).groundCells.length, 0);
console.log("Close-range mesh and wall-shadow regression checks passed.");
